"""Verify the pinned complete Touch R1 V3.2 URDF, meshes and display config.

Read-only validation; never imports a hardware SDK or communicates with devices.
"""
import hashlib
import json
import math
from pathlib import Path
import struct
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / 'Browser_SDK/assets/urdf/ld-touch'


def check():
    manifest = json.loads((ASSET / 'SOURCE.json').read_text(encoding='utf-8'))
    for relative, expected in manifest['sha256'].items():
        path = (ASSET / relative).resolve()
        assert path.is_relative_to(ASSET.resolve()), relative
        assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, relative
    source = (ASSET / 'source.urdf').read_bytes()
    assert (ASSET / 'model.urdf').read_bytes() == source.replace(b'filename="../meshes/', b'filename="meshes/')
    urdf = ET.fromstring(source)
    links, joints = urdf.findall('link'), urdf.findall('joint')
    assert len(links) == 9 and len(joints) == 8
    assert [joint.get('name') for joint in joints if joint.find('mimic') is None] == [f'joint_{i}' for i in range(1, 8)]
    passive = next(joint for joint in joints if joint.get('name') == 'left_finger_joint')
    assert passive.find('parent').get('link') == 'link_6'
    assert passive.find('child').get('link') == 'left_finger'
    mimic = passive.find('mimic')
    assert mimic.get('joint') == 'joint_7' and float(mimic.get('multiplier')) == -1 and float(mimic.get('offset')) == 0
    script = (ROOT / 'Browser_SDK/src/supplied_urdf_models.js').read_text(encoding='utf-8')
    config = json.loads(script[script.index('{'):script.rindex(';')])['ld-touch']
    assert len(config['parts']) == 25 and len(config['joints']) == 8
    references, triangle_count = set(), 0
    for link in links:
        for visual in link.findall('visual'):
            relative = visual.find('geometry/mesh').get('filename').removeprefix('../')
            references.add(relative)
            contents = (ASSET / relative).read_bytes()
            triangles = struct.unpack_from('<I', contents, 80)[0]
            assert len(contents) == 84 + 50 * triangles
            triangle_count += triangles
            parts = [part for part in config['parts'] if part['link'] == link.get('name') and part['url'].split('?')[0].endswith('/' + relative)]
            assert len(parts) == 1, relative
    assert len(references) == 25 and triangle_count == 214230
    assert references == {path.relative_to(ASSET).as_posix() for path in (ASSET / 'meshes').glob('*') if path.is_file()}
    assert len([name for name in references if name.endswith('-servo.stl')]) == 7
    for original, rendered in zip(joints, config['joints']):
        assert original.get('name') == rendered['name'] and original.get('type') == rendered['type']
        for tag, attribute, values in [('origin', 'xyz', rendered['origin']['xyz']),
                                       ('origin', 'rpy', rendered['origin']['rpy']),
                                       ('axis', 'xyz', rendered['axis'])]:
            expected = [float(value) for value in original.find(tag).get(attribute).split()]
            assert all(math.isclose(a, b, abs_tol=1e-12) for a, b in zip(expected, values)), rendered['name']
        assert original.find('parent').get('link') == rendered['parent']
        assert original.find('child').get('link') == rendered['child']
        original_mimic = original.find('mimic')
        assert rendered.get('mimic') == (None if original_mimic is None else {
            'joint': original_mimic.get('joint'), 'multiplier': float(original_mimic.get('multiplier', 1)),
            'offset': float(original_mimic.get('offset', 0))})
    print('Verified Touch R1 V3.2: 7 servos, 9 links, 7 independent joints, 1 mimic, 25 meshes / 214230 triangles.')


if __name__ == '__main__':
    check()
