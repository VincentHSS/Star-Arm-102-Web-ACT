"""Refresh the explicitly maintained delivery source manifests before packaging."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent

def refresh(release):
    directory=ROOT/'delivery'
    target=directory/'manifest.json'
    manifest=json.loads(target.read_text(encoding='utf-8'))
    manifest['release']=release
    for package in manifest['packages']:
        source=directory/package['directory']
        if not source.resolve().is_relative_to(directory.resolve()):raise ValueError('Invalid source directory')
        files=sorted(p for p in source.rglob('*') if p.is_file() and '__pycache__' not in p.parts
                     and p.suffix!='.pyc' and p.name!='SHA256SUMS')
        sums=[]
        for path in files:
            if path.is_symlink():raise ValueError('Delivery cannot include symlinks')
            sums.append(hashlib.sha256(path.read_bytes()).hexdigest()+'  '+path.relative_to(source).as_posix()+'\n')
        checksum=source/'SHA256SUMS'
        checksum.write_text(''.join(sums),encoding='utf-8',newline='\n')
        files.append(checksum)
        package['files']=[{'path':path.relative_to(directory).as_posix(),
                           'sha256':hashlib.sha256(path.read_bytes()).hexdigest()} for path in files]
        package['archive_sha256']=None
        package['archive_bytes']=None
    target.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('Updated delivery manifests for',release,'; run package_latest_delivery.py to create ZIP hashes')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release',required=True)
    refresh(parser.parse_args().release)
