"""Verify/extract the immutable pre-baseline chain for guarded local replay."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile
import base64

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE_DIR = ROOT / 'apps/api/prisma/history'


def verified_history():
    manifest = json.loads((ARCHIVE_DIR / 'through-0026.json').read_text(encoding='utf-8'))
    archive = ARCHIVE_DIR / manifest['archive']
    if hashlib.sha256(archive.read_bytes()).hexdigest() != manifest['archiveSha256']:
        raise ValueError('Historical archive checksum differs')
    with zipfile.ZipFile(archive) as source:
        expected = {item['path']: item['sha256'] for item in manifest['files']}
        if set(source.namelist()) != set(expected) or len(source.namelist()) != len(expected):
            raise ValueError('Historical archive entries differ')
        contents = {}
        for name, checksum in expected.items():
            if '\\' in name or name.startswith('/') or '..' in Path(name).parts:
                raise ValueError('Unsafe historical archive path')
            data = source.read(name)
            if hashlib.sha256(data).hexdigest() != checksum:
                raise ValueError('Historical migration checksum differs')
            contents[name] = data
    if len(contents) != 27:
        raise ValueError('Expected exactly 26 SQL files and the migration lock')
    return contents


def extract_history(destination):
    destination = Path(destination).resolve()
    temporary = (ROOT / '.tmp').resolve()
    if not destination.is_relative_to(temporary) or destination == temporary:
        raise ValueError('History extraction requires an isolated repository .tmp directory')
    contents = verified_history()
    if destination.exists() and any(destination.iterdir()):
        raise ValueError('Historical extraction destination must be empty')
    for name, data in contents.items():
        target = (destination / name).resolve()
        if not target.is_relative_to(destination):
            raise ValueError('Historical entry escaped destination')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--extract', type=Path)
    parser.add_argument('--read', help='Return one verified archived entry as base64 for local tooling')
    args = parser.parse_args()
    if args.read:
        print(base64.b64encode(verified_history()[args.read]).decode('ascii'))
        raise SystemExit(0)
    if args.extract:
        extract_history(args.extract)
    else:
        verified_history()
    print('HISTORICAL_MIGRATION_INTEGRITY=PASS')
