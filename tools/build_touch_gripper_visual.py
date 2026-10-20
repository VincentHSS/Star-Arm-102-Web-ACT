#!/usr/bin/env python3
"""Rebuild the Touch R1 fixed gripper-servo visual from the supplied LD CAD.

Uses only Python's standard library. Run with --check to verify the checked-in
STL and provenance JSON without writing files. This is a display asset builder;
it does not create a joint, alter calibration, or communicate with hardware.
"""

import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import struct


ROOT = Path(__file__).resolve().parents[1]
SOURCE = "Browser_SDK/assets/models/ld/link6.STL"
SOURCE_SHA = "7aa96b31802154e931f0182dc7500eda7dd4c326e7dcea93f0f27987336156ef"
BRACKET = "Browser_SDK/assets/urdf/ld-touch/meshes/link_6-structure.stl"
BRACKET_SHA = "eb7a772562e1fd49a895d61c10434ba141147dd136fbe959f4a665377d5f78bb"
TARGET = "Browser_SDK/assets/urdf/ld-touch/meshes/link_6-gripper-servo.stl"
METADATA = "Browser_SDK/assets/urdf/ld-touch/gripper-servo.json"

# Column-vector transform: Touch_link_6_vertex = R * old_LD_link6_vertex + t.
# Both binary STL files and t use metres. Rx(-90 degrees) plus the measured
# 0.000787529-degree X/Z correction aligns three original motor mounting axes.
ROTATION = [
    [0.999999999905538, 0.000013744979056134987, 0.0],
    [0.0, 0.0, 1.0],
    [0.000013744979056134981, -0.9999999999055378, 0.0],
]
TRANSLATION = [0.0030851126721924924, 0.06591623857617378, -0.0018749579879489322]
EXPECTED_COMPONENT_TRIANGLES = [5202, 4792, 1968, 1370, 1182, 60, 60, 60, 60, 60, 60, 60, 44, 44]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def transform(point):
    return tuple(sum(ROTATION[axis][i] * point[i] for i in range(3)) + TRANSLATION[axis] for axis in range(3))


def rebuild():
    data = (ROOT / SOURCE).read_bytes()
    if digest(data) != SOURCE_SHA:
        raise ValueError("Original LD link6.STL changed; re-audit motor extraction before rebuilding.")
    if digest((ROOT / BRACKET).read_bytes()) != BRACKET_SHA:
        raise ValueError("Touch mounting bracket changed; re-measure mounting axes and clearances.")
    count = struct.unpack_from("<I", data, 80)[0]
    if count != 15022 or len(data) != 84 + 50 * count:
        raise ValueError("Unexpected original LD binary STL layout.")
    triangles = []
    for index in range(count):
        values = struct.unpack_from("<12fH", data, 84 + index * 50)
        triangles.append(tuple(tuple(values[3 + 3 * corner + axis] for axis in range(3)) for corner in range(3)))

    # Weld at one micrometre, matching the supplied CAD's disconnected-solid
    # analysis. Keep original triangle order after excluding the grip structure.
    vertex_ids, parents, face_vertices = {}, [], []

    def find(vertex):
        while parents[vertex] != vertex:
            parents[vertex] = parents[parents[vertex]]
            vertex = parents[vertex]
        return vertex

    for triangle in triangles:
        ids = []
        for point in triangle:
            key = tuple(round(value, 6) for value in point)
            if key not in vertex_ids:
                vertex_ids[key] = len(parents)
                parents.append(len(parents))
            ids.append(vertex_ids[key])
        parents[find(ids[1])] = find(ids[0])
        parents[find(ids[2])] = find(ids[0])
        face_vertices.append(ids[0])
    face_components = [find(vertex) for vertex in face_vertices]
    component_counts = Counter(face_components)
    component_triangles = sorted(component_counts.values(), reverse=True)
    if component_triangles != EXPECTED_COMPONENT_TRIANGLES:
        raise ValueError(f"Unexpected CAD connected components: {component_triangles}")
    structure = max(component_counts, key=component_counts.get)
    selected = [triangle for triangle, component in zip(triangles, face_components) if component != structure]
    if len(selected) != 9820:
        raise ValueError("Expected exactly 13 motor components / 9820 triangles.")

    output = bytearray(b"Touch R1 fixed gripper servo; recovered original LD CAD".ljust(80, b" "))
    output.extend(struct.pack("<I", len(selected)))
    transformed = []
    for triangle in selected:
        vertices = tuple(transform(point) for point in triangle)
        transformed.extend(vertices)
        u = tuple(vertices[1][axis] - vertices[0][axis] for axis in range(3))
        v = tuple(vertices[2][axis] - vertices[0][axis] for axis in range(3))
        normal = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
        magnitude = math.sqrt(sum(value * value for value in normal))
        normal = tuple(value / magnitude for value in normal) if magnitude else (0.0, 0.0, 0.0)
        output.extend(struct.pack("<12fH", *normal, *(value for point in vertices for value in point), 0))

    residuals = [0.00000044017086777727033, 0.0000006417071222312574, 0.0000008648956923619807]
    metadata = {
        "schemaVersion": 1,
        "purpose": "Fixed visual recovery of the original gripper motor in the revised Touch R1 bracket; no new motion joint.",
        "source": {
            "path": SOURCE, "sha256": SOURCE_SHA, "units": "metres",
            "triangles": count, "components": 14,
            "componentTrianglesDescending": component_triangles,
        },
        "extraction": {
            "method": "Connected components with vertex coordinates rounded to 1e-6 metres; exclude the largest grip structure; retain original triangle order.",
            "excludedStructureTriangles": 5202, "servoComponents": 13, "servoTriangles": 9820,
        },
        "bracket": {"path": BRACKET, "sha256": BRACKET_SHA},
        "target": {
            "link": "link_6", "mesh": "meshes/link_6-gripper-servo.stl",
            "sha256": digest(output), "units": "metres", "triangles": len(selected),
            "visualOriginXyz": [0, 0, 0], "visualOriginRpy": [0, 0, 0],
            "boundsMm": [
                [min(point[axis] for point in transformed) * 1000 for axis in range(3)],
                [max(point[axis] for point in transformed) * 1000 for axis in range(3)],
            ],
        },
        "registration": {
            "convention": "Column vectors: p_touch_link_6 = rotationOldLdToTouch * p_old_ld_link6 + translationMeters",
            "rotationOldLdToTouch": ROTATION,
            "translationMeters": TRANSLATION,
            "method": "Rigid alignment of three motor mounting-hole axes to the new bracket; retain original 0.15 mm front installation clearance along the hole axis.",
            "sourceHoleCentersAfterRxMinus90XzMm": [
                [-13.350000040375926, -4.650000589522492],
                [-20.350000238836152, 2.349999541666506],
                [-13.349999772671287, 9.350000502135368],
            ],
            "bracketHoleCentersXzMm": [
                [-10.264823065152946, -6.5251418639129],
                [-17.264920017130734, 0.47476246668324507],
                [-10.26501585067262, 7.474858185730978],
            ],
            "holeAxisResidualMm": residuals,
            "maxHoleAxisResidualMm": max(residuals),
            "holeResidualMeaning": "Numerical fit of the provided STL geometry, not manufacturing or physical calibration accuracy.",
            "installationPlanesMm": {
                "sourceMotorFrontAfterRxMinus90": -10.15,
                "sourceBracketFrontAfterRxMinus90": -10.0,
                "targetBracketFront": 55.91623857617378,
                "targetMotorFront": 55.76623857617378,
                "targetBracketRear": 15.516236424446106,
                "targetMotorRear": 15.76623857617378,
            },
            "clearancesMm": {"left": 0.200, "right": 0.200, "front": 0.150, "rear": 0.250002, "floor": 0.200},
            "clearanceMeaning": "Measured mating-plane/slot clearances, not whole-assembly collision certification.",
        },
        "validation": {
            "physicalHardwareVerified": False,
            "controlOrJointChanges": False,
            "visualReview": "Local Edge preview: oblique, mounting-plane front, and transparent side views.",
        },
        "rebuild": {"command": "python tools/build_touch_gripper_visual.py", "checkCommand": "python tools/build_touch_gripper_visual.py --check"},
    }
    return bytes(output), (json.dumps(metadata, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check existing STL and metadata without changing files.")
    args = parser.parse_args()
    mesh, metadata = rebuild()
    for relative, contents in [(TARGET, mesh), (METADATA, metadata)]:
        destination = ROOT / relative
        if args.check:
            if not destination.is_file() or destination.read_bytes() != contents:
                raise SystemExit(f"Out of date: {relative}")
        else:
            destination.write_bytes(contents)
    print(("Verified" if args.check else "Built") + " Touch R1 gripper servo: 13 motor components, 9820 triangles; source and bracket SHA-256 verified.")


if __name__ == "__main__":
    main()
