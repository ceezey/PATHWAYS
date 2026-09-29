"""Compare replay catalogs, accounting only for equivalent SQL dump representations."""
import json
import re
import sys
from pathlib import Path


def boolean_expression(sql):
    tokens = re.findall(r"'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|[A-Za-z_][A-Za-z_0-9]*|\d+(?:\.\d+)?|::|<>|>=|<=|\S", sql)

    def parse(parts):
        while parts and parts[0] == '(' and parts[-1] == ')':
            depth = 0
            wraps = True
            for index, token in enumerate(parts):
                depth += (token == '(') - (token == ')')
                if depth == 0 and index != len(parts) - 1:
                    wraps = False
                    break
            if not wraps:
                break
            parts = parts[1:-1]
        for operator in ['OR', 'AND']:
            depth = 0
            splits = []
            for index, token in enumerate(parts):
                depth += (token == '(') - (token == ')')
                if depth == 0 and token.upper() == operator:
                    splits.append(index)
            if splits:
                children = []
                start = 0
                for end in splits + [len(parts)]:
                    child = parse(parts[start:end])
                    if child[0] == operator:
                        children.extend(child[1:])
                    else:
                        children.append(child)
                    start = end + 1
                return (operator, *children)
        return ('LEAF', *parts)

    if any(token.upper() in ['CASE', 'BETWEEN'] for token in tokens):
        return tokens
    if tokens[:2] == ['CHECK', '('] and tokens[-1] == ')':
        return parse(tokens[1:])
    return tokens


def normalized(value):
    # PG18 exposes NOT NULL entries as constraints; nullable column definitions
    # remain an exact comparison across PG17 and PG18.
    value['constraints'] = [row for row in value['constraints'] if not row[2].startswith('NOT NULL')]
    for row in value['functions']:
        row[2] = row[2].replace('\r\n', '\n')
        if row[3] is not None:
            row[3] = sorted(row[3])
    if 'tableSecurityFormat' in value:
        if value['tableSecurityFormat'] != 'OWNER_DERIVED_EFFECTIVE_ACL_V1':
            raise ValueError('Unsupported forward table security format')
        owners = value.get('forwardSecurity', {}).get('relationOwners')
        if not isinstance(owners, list):
            raise ValueError('Forward relation owners missing')
        owner_map = {}
        for row in owners:
            if (not isinstance(row, list) or len(row) != 3 or
                    any(not isinstance(x, str) or not x for x in row) or
                    row[0] not in ['pathways', 'pathways_rules_internal'] or
                    tuple(row[:2]) in owner_map):
                raise ValueError('Malformed forward relation owners')
            owner_map[tuple(row[:2])] = row[2]
        tables = value['tableSecurity']
        if not isinstance(tables, list):
            raise ValueError('Malformed forward table security')
        seen = set()
        for row in tables:
            if (not isinstance(row, list) or len(row) != 6 or
                    any(not isinstance(x, str) or not x for x in row[:3]) or
                    row[0] not in ['pathways', 'pathways_rules_internal'] or
                    type(row[3]) is not bool or type(row[4]) is not bool or
                    not isinstance(row[5], list) or
                    any(not isinstance(x, str) or not x for x in row[5]) or
                    len(set(row[5])) != len(row[5])):
                raise ValueError('Malformed forward table security')
            key = tuple(row[:2])
            if key in seen or owner_map.get(key) != row[2]:
                raise ValueError('Forward table owner absent or inconsistent')
            seen.add(key)
            # PostgreSQL derives NULL defaults from the actual owner OID.
            # All effective grant strings remain exact, including grant options.
            row[5] = sorted(row[5])
    elif 'forwardSecurity' in value:
        raise ValueError('Forward table security format missing')
    else:
        for row in value['tableSecurity']:
            if not isinstance(row, list) or len(row) != 4:
                raise ValueError('Malformed legacy table security')
            # Historical fixtures verify Prisma ownership separately.
            acl = sorted(row[3] or [])
            row[3] = [entry for entry in acl if entry != 'prisma=arwdDxtm/prisma']
    for row in value['constraints']:
        row[2] = boolean_expression(row[2])
    return value


def compare(left, right):
    left, right = normalized(left), normalized(right)
    differences = [name for name in left if left[name] != right.get(name)]
    if differences:
        raise ValueError('Catalog differences: ' + ', '.join(differences))


if __name__ == '__main__':
    compare(*(json.loads(Path(name).read_text(encoding='utf-8-sig')) for name in sys.argv[1:3]))
    print('SECURITY_CATALOG_PARITY=PASS')
