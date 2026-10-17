import hashlib, importlib.util, tempfile, unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('owner_candidate',ROOT/'scripts/north12b/prepare_awards_owner_candidate.py')
candidate=importlib.util.module_from_spec(spec);spec.loader.exec_module(candidate)
SNAPSHOT=ROOT/'docs/ops/google-drive-cloud-source-p0-20260824/runtime-after/update_phone_awards.py'

class OwnerIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.live=self.root/'update_phone_awards.py';self.live.write_bytes(SNAPSHOT.read_bytes())

    def test_existing_owner_patch_is_exact_and_candidate_does_not_install(self):
        before=self.live.read_bytes();receipt=candidate.prepare(self.live,self.root/'review',private_root=self.root)
        self.assertEqual(receipt['owner_tests_passed'],6);self.assertEqual(self.live.read_bytes(),before)
        self.assertEqual(receipt['changed_functions'],['build_person_awards_from_source']);self.assertTrue(receipt['other_components_preserved'])
        self.assertEqual(receipt['owner_patch_sha256'],hashlib.sha256(candidate.OWNER_PATCH.read_bytes()).hexdigest())
        self.assertEqual(receipt['production_writes'],0)

    def test_modified_owner_file_is_rejected_without_candidate(self):
        changed=self.root/'changed-owner.py';changed.write_bytes(candidate.OWNER_PATCH.read_bytes()+b'\n')
        with self.assertRaisesRegex(ValueError,'OWNER_PATCH_HASH_MISMATCH'):
            candidate.prepare(self.live,self.root/'review',owner_patch=changed,private_root=self.root)
        self.assertFalse((self.root/'review').exists())

    def test_formal_or_existing_output_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'REVIEW_OUTPUT_OUTSIDE_PRIVATE_WORKSPACE'):
            candidate.prepare(self.live,self.root.parent/'formal-target',private_root=self.root)
        output=self.root/'review';output.mkdir()
        with self.assertRaisesRegex(ValueError,'REVIEW_OUTPUT_ALREADY_EXISTS'):
            candidate.prepare(self.live,output,private_root=self.root)

    def test_already_patched_reader_is_preserved_idempotently(self):
        spec=importlib.util.spec_from_file_location('original_owner',candidate.OWNER_PATCH)
        owner=importlib.util.module_from_spec(spec);spec.loader.exec_module(owner)
        patched=owner.corrected_source(self.live.read_text());self.live.write_text(patched)
        receipt=candidate.prepare(self.live,self.root/'review',private_root=self.root)
        self.assertEqual(receipt['changed_functions'],[]);self.assertEqual(receipt['before_sha256'],receipt['candidate_sha256'])

if __name__=='__main__':unittest.main()
