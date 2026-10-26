"""Validated calibration candidates. Loading a candidate never activates it."""
from copy import deepcopy
import hashlib
import json
import math
import os
from pathlib import Path
import re
import tempfile


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError('校准数值无效')
    value = float(value)
    if not math.isfinite(value):
        raise ValueError('校准数值无效')
    return value


def _six(value):
    if not isinstance(value, list) or len(value) != 6:
        raise ValueError('校准需要完整六轴数据')
    return [_number(item) for item in value]


def validate_profile(profile):
    if not isinstance(profile, dict) or type(profile.get('schema')) is not int or profile['schema'] != 1:
        raise ValueError('校准文件版本无效')
    if profile.get('leader_type') != 'TOUCH' or profile.get('follower_type') != 'LUMOS':
        raise ValueError('校准设备配对不匹配')
    if profile.get('gripper_type') not in ('TypeLJ', 'TypeFZ', 'TypeNex'):
        raise ValueError('校准夹爪型号无效')
    if not isinstance(profile.get('can_interface'), str) or re.fullmatch(r'[A-Za-z0-9_.:-]{1,15}', profile['can_interface']) is None:
        raise ValueError('校准 CAN 接口无效')
    result = deepcopy(profile)
    calibration = result.get('calibration')
    if not isinstance(calibration, dict) or calibration.get('range_ready') is not True:
        raise ValueError('校准尚未完成')
    mapping = calibration.get('joint_map')
    if not isinstance(mapping, list) or len(mapping) != 6 or any(type(i) is not int for i in mapping) or sorted(mapping) != list(range(6)):
        raise ValueError('校准关节映射无效')
    for key in ('signs', 'leader_home_deg', 'lumos_home_rad', 'range_min_deg', 'range_max_deg'):
        calibration[key] = _six(calibration.get(key))
    if any(value not in (-1, 1) for value in calibration['signs']):
        raise ValueError('校准关节方向无效')
    calibration['gain'] = _number(calibration.get('gain'))
    if not 0 < calibration['gain'] <= 1:
        raise ValueError('校准增益无效')
    for low, home, high in zip(calibration['range_min_deg'], calibration['leader_home_deg'], calibration['range_max_deg']):
        if not low <= home <= high or high - low < 2 or not math.isfinite(high - low):
            raise ValueError('校准关节范围无效')
    gripper = calibration.get('gripper')
    if not isinstance(gripper, dict) or type(gripper.get('invert')) is not bool:
        raise ValueError('校准夹爪配置无效')
    for key in ('closed_deg', 'open_deg', 'leader_home_deg', 'lumos_home_ratio'):
        gripper[key] = _number(gripper.get(key))
    if not 0 <= gripper['lumos_home_ratio'] <= 1 or not math.isfinite(gripper['open_deg'] - gripper['closed_deg']) or abs(gripper['open_deg'] - gripper['closed_deg']) < 2:
        raise ValueError('校准夹爪端点无效')
    # Derive target bounds from validated mapping; never trust stored limits.
    endpoints = []
    for key in ('range_min_deg', 'range_max_deg'):
        endpoints.append([
            home + sign * calibration['gain'] * math.radians(value - neutral)
            for home, sign, value, neutral in zip(calibration['lumos_home_rad'], calibration['signs'], calibration[key], calibration['leader_home_deg'])
        ])
    calibration['target_min_rad'] = _six([min(a, b) for a, b in zip(*endpoints)])
    calibration['target_max_rad'] = _six([max(a, b) for a, b in zip(*endpoints)])
    samples = calibration.get('samples')
    if type(samples) is not int or not 0 <= samples <= 1_000_000_000:
        raise ValueError('校准采样数量无效')
    calibration = {key: calibration[key] for key in (
        'joint_map', 'signs', 'gain', 'leader_home_deg', 'lumos_home_rad',
        'range_min_deg', 'range_max_deg', 'target_min_rad', 'target_max_rad', 'range_ready', 'samples')}
    calibration['gripper'] = {key: gripper[key] for key in (
        'closed_deg', 'open_deg', 'invert', 'leader_home_deg', 'lumos_home_ratio')}
    return {key: result[key] for key in ('schema', 'leader_type', 'follower_type', 'can_interface', 'gripper_type')} | {'calibration': calibration}


def profile_id(profile):
    return hashlib.sha256(json.dumps(profile, sort_keys=True, allow_nan=False).encode()).hexdigest()


def load_profile(path):
    path = Path(path)
    with path.open('r', encoding='utf-8') as source:
        content = source.read(65_537)
    if len(content) > 65_536:
        raise ValueError('校准文件过大')
    return validate_profile(json.loads(content))


def save_profile(path, profile):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, prefix='.calibration-', delete=False) as output:
            temporary = Path(output.name)
            json.dump(profile, output, ensure_ascii=False, allow_nan=False)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
