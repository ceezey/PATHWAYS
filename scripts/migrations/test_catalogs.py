import unittest
from compare_catalogs import boolean_expression
from history import extract_history, verified_history


class MigrationSafetyTests(unittest.TestCase):
    def test_archive_contains_all_immutable_steps(self):
        data = verified_history()
        self.assertEqual(len(data), 27)
        self.assertIn('0026_csv_rbac_realignment/migration.sql', data)
        self.assertTrue(data['0001_init/migration.sql'].startswith(b'CREATE EXTENSION'))

    def test_extraction_rejects_workspace_and_external_destinations(self):
        for destination in ['.', 'C:/', '../outside-history']:
            with self.assertRaises(ValueError):
                extract_history(destination)

    def test_boolean_associativity_does_not_discard_precedence(self):
        self.assertEqual(boolean_expression('CHECK ((a AND b) AND c)'), boolean_expression('CHECK (a AND (b AND c))'))
        self.assertNotEqual(boolean_expression('CHECK (a AND (b OR c))'), boolean_expression('CHECK ((a AND b) OR c)'))
        self.assertNotEqual(boolean_expression('CHECK (a AND NOT (b OR c))'), boolean_expression('CHECK (a AND (NOT b OR c))'))

    def test_literals_and_nonboolean_grouping_stay_distinct(self):
        self.assertNotEqual(boolean_expression("CHECK (x = 'a AND b')"), boolean_expression("CHECK (x = 'a OR b')"))
        self.assertNotEqual(boolean_expression('CHECK ((a + b) * c > 0)'), boolean_expression('CHECK (a + (b * c) > 0)'))


if __name__ == '__main__':
    unittest.main()
