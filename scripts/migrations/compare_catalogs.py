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
    for row in value['tableSecurity']:
        # The verified owner is prisma. An explicit default owner ACL and a null
        # default ACL have the same effective privileges; other grants stay exact.
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
