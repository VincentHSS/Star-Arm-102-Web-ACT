"""Repack the checked complete website and standalone Lumos delivery sources."""
from pathlib import Path
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
        print(target)

if __name__=='__main__':main()
