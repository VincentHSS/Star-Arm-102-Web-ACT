"""Locate original LD motor cases and emit exact, display-only STL face groups."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'Browser_SDK/src/servo_setup_parts.js'


def build():
    parts, motors = {}, []
    for link in ['base_link'] + [f'link{i}' for i in range(1, 7)]:
        path = ROOT / 'Browser_SDK/assets/models/ld' / (link + '.STL')
        data = path.read_bytes(); count = struct.unpack_from('<I', data, 80)[0]
        assert len(data) == 84 + 50 * count
        vertices, parents, faces, starts = {}, [], [], []

        def find(vertex):
            while parents[vertex] != vertex:
                parents[vertex] = parents[parents[vertex]]; vertex = parents[vertex]
            return vertex

        for index in range(count):
            values = struct.unpack_from('<12fH', data, 84 + 50 * index)
            points = [values[3 + 3 * i:6 + 3 * i] for i in range(3)]; ids = []
            for point in points:
                key = tuple(round(value, 6) for value in point)
                if key not in vertices:
                    vertices[key] = len(parents); parents.append(len(parents))
                ids.append(vertices[key])
            parents[find(ids[1])] = find(ids[0]); parents[find(ids[2])] = find(ids[0])
            faces.append(points); starts.append(ids[0])
        components = [find(vertex) for vertex in starts]
        counts = Counter(components); component_points = {}
        for component, points in zip(components, faces): component_points.setdefault(component, []).extend(points)
        centres = {component: [(min(p[a] for p in points) + max(p[a] for p in points)) / 2 for a in range(3)]
                   for component, points in component_points.items()}
        if link == 'base_link':
            slots = {component: 0 for component in counts}
            motors.append({'slot': 0, 'link': link, 'center': [0, 0, .03135]})
        elif link == 'link4':
            assert list(counts.values()) == [3944], 'link4 is a bracket, not motor 5'
            slots = {component: None for component in counts}
        elif link == 'link5':
            assert sorted(counts.values(), reverse=True)[:8] == [6452, 4792, 1978, 1968, 1370, 1182, 540, 432]
            slots = {component: None if n == 6452 else 4 if n in (1978, 540, 432) or n < 100 and centres[component][2] > .03 else 5
                     for component, n in counts.items()}
            for slot, body_count in [(4, 1978), (5, 4792)]:
                body = next(component for component, n in counts.items() if n == body_count)
                motors.append({'slot': slot, 'link': link, 'center': centres[body], 'caseFaces': body_count})
        else:
            slot = {'link1': 1, 'link2': 2, 'link3': 3, 'link6': 6}[link]
            structure = {'link1': 4588, 'link2': 5240, 'link3': 9920, 'link6': 5202}[link]
            assert structure in counts.values() and 4792 in counts.values()
            slots = {component: None if n == structure else slot for component, n in counts.items()}
            body = next(component for component, n in counts.items() if n == 4792)
            motors.append({'slot': slot, 'link': link, 'center': centres[body], 'caseFaces': 4792})
        # Compact runs refer to original triangle order, without changing the CAD.
        ranges = []
        for index, component in enumerate(components):
            slot = slots[component]
            if ranges and ranges[-1]['slot'] == slot: ranges[-1]['count'] += 1
            else: ranges.append({'first': index, 'count': 1, 'slot': slot})
        parts[link] = {'sha256': hashlib.sha256(data).hexdigest(), 'triangles': count, 'ranges': ranges}
    result = {'schema': 1, 'units': 'metres', 'motors': sorted(motors, key=lambda motor: motor['slot']), 'parts': parts}
    return ('// Generated from original LD CAD by tools/build_ld_servo_map.py; display only.\n'
            'export const LD_SERVO_PARTS = ' + json.dumps(result, ensure_ascii=False, indent=2) + ';\n').encode('utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--check', action='store_true'); args = parser.parse_args()
    data = build()
    if args.check: assert TARGET.read_bytes() == data, 'LD servo case map changed; regenerate and review it'
    else: TARGET.write_bytes(data)
    print('LD seven-motor case map verified' if args.check else 'Generated LD seven-motor case map')
