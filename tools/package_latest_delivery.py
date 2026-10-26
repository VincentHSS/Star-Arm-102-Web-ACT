"""Repack the checked complete website and standalone Lumos delivery sources."""
from pathlib import Path
import hashlib
import json
import zipfile
from check_latest_delivery import ROOT,check

def main():
    manifest=check()
    output=ROOT/'dist/latest-delivery'
    output.mkdir(parents=True,exist_ok=True)
    for package in manifest['packages']:
        target=output/package['archive']
        with zipfile.ZipFile(target,'w') as archive:
            for entry in package['files']:
                path=ROOT/'delivery'/entry['path']
                info=zipfile.ZipInfo(entry['path'])
                info.create_system=3
                info.external_attr=(0o100755 if path.suffix=='.sh' else 0o100644)<<16
                info.compress_type=zipfile.ZIP_STORED if path.suffix in {'.bin','.whl'} else zipfile.ZIP_DEFLATED
                archive.writestr(info,path.read_bytes(),compresslevel=6)
        with zipfile.ZipFile(target) as archive:
            if archive.testzip() is not None:raise ValueError('ZIP integrity check failed')
            for entry in package['files']:
                if hashlib.sha256(archive.read(entry['path'])).hexdigest()!=entry['sha256']:
                    raise ValueError('Packaged file hash mismatch: '+entry['path'])
        package['archive_sha256']=hashlib.sha256(target.read_bytes()).hexdigest()
        package['archive_bytes']=target.stat().st_size
        print(target)
    (ROOT/'delivery/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',
                                            encoding='utf-8',newline='\n')
    (output/(f'Star-Arm-102-{manifest["release"]}-SHA256SUMS.txt')).write_text(''.join(
        p['archive_sha256']+'  '+p['archive']+'\n' for p in manifest['packages']),encoding='utf-8',newline='\n')

if __name__=='__main__':main()
