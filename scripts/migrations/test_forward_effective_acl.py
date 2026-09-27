import copy
import unittest
from compare_catalogs import compare


def catalog():
    return {'constraints': [], 'functions': [],
            'tableSecurityFormat': 'OWNER_DERIVED_EFFECTIVE_ACL_V1',
            'forwardSecurity': {'relationOwners': [['pathways_rules_internal', 'sample', 'rules_store_owner']]},
            'tableSecurity': [['pathways_rules_internal', 'sample', 'rules_store_owner', True, True,
                              ['rules_store_owner=arwdDxtm/rules_store_owner', 'reader=r*/rules_store_owner']]]}


class ForwardEffectiveAclTests(unittest.TestCase):
    def test_identical_effective_privileges_pass(self):
        compare(catalog(), catalog())

    def test_acl_order_only_is_immaterial(self):
        right = catalog()
        right['tableSecurity'][0][5].reverse()
        compare(catalog(), right)

    def test_grant_option_privilege_owner_and_force_rls_drift_denied(self):
        for column, replacement in [(5, ['rules_store_owner=arwdDxtm/rules_store_owner', 'reader=r/rules_store_owner']),
                                    (5, ['rules_store_owner=ardDxtm/rules_store_owner', 'reader=r*/rules_store_owner']),
                                    (2, 'other_owner'), (4, False), (3, False)]:
            right = catalog()
            right['tableSecurity'][0][column] = replacement
            if column == 2:
                right['forwardSecurity']['relationOwners'][0][2] = replacement
            with self.subTest(column=column, replacement=replacement), self.assertRaises(ValueError):
                compare(catalog(), right)

    def test_unexpected_prisma_default_grant_not_stripped(self):
        right = catalog()
        right['tableSecurity'][0][5].append('prisma=arwdDxtm/prisma')
        with self.assertRaises(ValueError):
            compare(catalog(), right)

    def test_missing_malformed_or_inconsistent_owners_fail_closed(self):
        mutants = []
        for owners in [None, [], [['pathways_rules_internal', 'sample']],
                       [['pathways_rules_internal', 'sample', 'other']],
                       [['pathways_rules_internal', 'sample', 'rules_store_owner']] * 2]:
            value = catalog()
            value['forwardSecurity']['relationOwners'] = owners
            mutants.append(value)
        for value in mutants:
            with self.subTest(value=value), self.assertRaises(ValueError):
                compare(value, copy.deepcopy(value))

    def test_forward_format_or_row_cannot_fall_back_to_legacy_normalization(self):
        for operation in ['missing_format', 'wrong_format', 'null_acl', 'bad_bool', 'short_row', 'duplicate_acl']:
            value = catalog()
            if operation == 'missing_format':
                del value['tableSecurityFormat']
            elif operation == 'wrong_format':
                value['tableSecurityFormat'] = 'other'
            elif operation == 'null_acl':
                value['tableSecurity'][0][5] = None
            elif operation == 'bad_bool':
                value['tableSecurity'][0][4] = 'true'
            elif operation == 'short_row':
                value['tableSecurity'][0].pop()
            else:
                value['tableSecurity'][0][5] *= 2
            with self.subTest(operation=operation), self.assertRaises(ValueError):
                compare(value, copy.deepcopy(value))

    def test_legacy_default_owner_representation_unchanged(self):
        left = {'constraints': [], 'functions': [], 'tableSecurity': [['sample', True, True, None]]}
        right = copy.deepcopy(left)
        right['tableSecurity'][0][3] = ['prisma=arwdDxtm/prisma']
        compare(left, right)

    def test_missing_forward_format_cannot_downgrade_to_legacy_rows(self):
        value = catalog()
        del value['tableSecurityFormat']
        value['tableSecurity'] = [['sample', True, True, ['prisma=arwdDxtm/prisma']]]
        with self.assertRaises(ValueError):
            compare(value, copy.deepcopy(value))

    def test_legitimate_explicit_empty_effective_acl_is_preserved(self):
        value = catalog()
        value['tableSecurity'][0][5] = []
        compare(value, copy.deepcopy(value))
        with self.assertRaises(ValueError):
            compare(catalog(), value)


if __name__ == '__main__':
    unittest.main()
