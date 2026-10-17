#!/usr/bin/env python3
"""Apply the hash-pinned existing owner's patch to a review copy; never install it."""
import argparse, ast, difflib, hashlib, importlib.util, json, os, subprocess, sys
from pathlib import Path

CODE=Path(__file__).resolve().parent
OWNER_PATCH=CODE/'owner_patches/apply_person_award_fix_20261009.py'
OWNER_SHA256='70fcd55724f912ff8f472a11159c5cfcf7ccf20ea1f4e5e85a04db8e0e72904d'
PRIVATE_ROOT=CODE.parents[2]/'investigation-20261013'
LIVE=Path('/Users/liamlu/Downloads/liam-agent/report-automation/work/update_phone_awards.py')

def sha(data):return hashlib.sha256(data).hexdigest()

def prepare(runtime,output,*,owner_patch=OWNER_PATCH,private_root=PRIVATE_ROOT):
    runtime=runtime.resolve(strict=True);output=output.resolve()
    if not output.is_relative_to(private_root.resolve()) or output==runtime.parent:
        raise ValueError('REVIEW_OUTPUT_OUTSIDE_PRIVATE_WORKSPACE')
    if output.exists():raise ValueError('REVIEW_OUTPUT_ALREADY_EXISTS')
    owner_bytes=owner_patch.read_bytes()
    if sha(owner_bytes)!=OWNER_SHA256:raise ValueError('OWNER_PATCH_HASH_MISMATCH')
    before_bytes=runtime.read_bytes();before=before_bytes.decode('utf-8')
    spec=importlib.util.spec_from_file_location('original_person_award_owner_patch',owner_patch)
    owner=importlib.util.module_from_spec(spec);spec.loader.exec_module(owner)
    after=owner.corrected_source(before)
    # Independently constrain the original patch to its one reader function.
    unaffected=lambda s:[ast.dump(n,include_attributes=False) for n in ast.parse(s).body
        if not(isinstance(n,ast.FunctionDef) and n.name=='build_person_awards_from_source')]
    if unaffected(before)!=unaffected(after):raise ValueError('OWNER_PATCH_CHANGED_OTHER_COMPONENT')
    output.mkdir(parents=True,mode=0o700);candidate=output/runtime.name;candidate.write_text(after,encoding='utf-8')
    with (output/'owner-six-regressions.log').open('w') as log:
        subprocess.run([sys.executable,str(owner_patch),'--target',str(candidate),'--verify-only'],
            env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'},stdout=log,stderr=subprocess.STDOUT,check=True)
    if runtime.read_bytes()!=before_bytes:raise ValueError('LIVE_RUNTIME_CHANGED_DURING_PREPARATION')
    (output/'minimal-owner.patch').write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),
        fromfile='work/'+runtime.name,tofile='work/'+runtime.name)))
    receipt={'status':'prepared_not_installed','owner_version':owner.VERSION,'owner_patch_sha256':OWNER_SHA256,
        'owner_library_file_id':'libfile_6092496c98788191ae0a89aab113df6d','runtime_file':str(runtime),
        'before_sha256':sha(before_bytes),'candidate_sha256':sha(candidate.read_bytes()),
        'changed_functions':['build_person_awards_from_source'] if before!=after else [],
        'other_components_preserved':True,'owner_tests_passed':6,'production_writes':0,'external_sends':0}
    (output/'candidate-receipt.json').write_text(json.dumps(receipt,indent=2))
    return receipt

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--runtime',type=Path,default=LIVE)
    p.add_argument('--output',type=Path,required=True);a=p.parse_args();print(json.dumps(prepare(a.runtime,a.output)))

if __name__=='__main__':main()
