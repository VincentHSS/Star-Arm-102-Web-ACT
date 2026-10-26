"""Verify the complete delivered sources without starting hardware or services."""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent

def check():
    directory=ROOT/'delivery'
    manifest=json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
    count=0
    for package in manifest['packages']:
        expected=set()
        for entry in package['files']:
            path=(directory/entry['path']).resolve()
            if not path.is_relative_to(directory.resolve()):raise ValueError('Invalid delivery path')
            if hashlib.sha256(path.read_bytes()).hexdigest()!=entry['sha256']:
                raise ValueError('Delivery hash mismatch: '+entry['path'])
            expected.add(path);count+=1
        actual={p.resolve() for p in (directory/package['directory']).rglob('*')
                if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc'}
        if actual!=expected:raise ValueError('Delivery file set mismatch: '+package['directory'])
    print(f'Verified {count} files in {len(manifest["packages"])} complete delivery packages')
    return manifest

if __name__=='__main__':check()
