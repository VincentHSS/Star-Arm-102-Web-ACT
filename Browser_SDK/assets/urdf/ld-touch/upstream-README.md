# Touch R1 Leader Arm 机器人描述

[← Touch R1 Leader Arm 硬件](../README.md)　|　<sub>**简体中文**</sub>

根据去除 A000、B000 两个限位块的 FCStd 装配体，配合提供的 RP8-U45H-M / C028 舵机模型，生成 **7 个连杆、6 个活动关节**的 URDF，供外形核对和可拖动关节的运动学预览。

**目录：**

- [📦 下载与预览](#preview)
- [🔩 模型来源](#sources)
- [🔄 关节与坐标](#kinematics)
- [⚠️ 待确认参数](#confirmation)
- [✅ 验证与重新生成](#validation)

<a id="preview"></a>

## 下载与预览

| 资源 | 用途 |
| --- | --- |
| [完整资源包 ZIP](touch-r1-urdf.zip) | URDF、21 份网格、交互预览与使用说明；下载后解压 |
| [touch-r1.urdf](touch_r1_description/urdf/touch-r1.urdf) | 机器人连接树与视觉模型引用；不能脱离配套网格单独使用 |
| [交互预览页面](preview/index.html) | 旋转视角、拖动六轴、恢复源装配姿态、按连杆着色 |
| [生成与轴线记录](kinematics.json) | 源文件校验值、轴线、舵机替换差异、实体归属及网格验证记录 |

![Touch R1 六轴交互预览](images/preview.png)

GitHub 只展示 HTML 源码，不直接运行交互预览。下载本仓库后，在仓库根目录执行：

```bash
cd hardware/robot-description
python -m http.server 8765 --bind 127.0.0.1
```

在浏览器打开 `http://127.0.0.1:8765/preview/`。若下载的是 ZIP，在解压后的目录直接执行同一条 `python -m http.server` 命令。端口被占用时可换为 `8766`，并使用对应地址。

预览依赖已随包提供，无需联网。拖动模型旋转视角，滚轮缩放，右键平移；右侧滑块调整关节角度。URDF 与网格通过相对路径加载，因此需保留 `touch_r1_description/urdf/` 和 `touch_r1_description/meshes/` 的相对位置，并通过上述 HTTP 服务打开预览。

<a id="sources"></a>

## 模型来源

| 来源 | 使用方式 |
| --- | --- |
| [去除限位块的 FCStd 装配体](source/r1-hd-urdf-only.FCStd) | 当前 URDF 的结构件、附件及安装位置来源；文件内容与用户提供的 `r1-hd-rudf-only.FCStd` 一致，仅规范文件名 |
| [RP8-U45H-M-C028](../step/components/rp8-u45h-m-c028.step) | 使用用户提供的 C028 STEP，替换 3 个对应舵机实例 |
| [RP8-U45H-M](../step/components/rp8-u45h-m.step) | 使用用户提供的双出轴 STEP，替换 3 个原 `_25-50KG-0001_ASM_ASM` 实例 |

当前 FCStd 有 **97 个实体叶节点**，相较原 V3.1 的 99 个实体，移除了 A000、B000 两个限位块。生成器直接遍历当前装配的零件树，保留全局安装位置；父装配的缓存形体不重复计数，基准平面与坐标轴不进入网格。

本次同时提供的 `r1-hd-rudf-only.step` 包含父装配和子零件的重复导出，读入时出现 338 个实体实例及无界基准几何，因此不作为 URDF 输入。这是这份 STEP 的导出内容问题，不是 STEP 格式本身不能使用；重新导出时只选择最上层装配一次，并排除基准几何。

两个舵机模型与 FCStd 中对应实例的安装坐标系和输出轴一致，最大包围尺寸差为 0.00043 mm。双出轴模型有 15 个实体，原模型有 14 个；替换后整套 URDF 视觉模型为 **100 个实体**。原始 V3.1 STEP 与 CAD BOM 仍用于硬件资料，采购补充件未建模，也不补入 URDF。

舵机机壳及内部固定几何跟随上游连杆，识别出的舵盘跟随下游连杆；不能把整个舵机刚性合并到同一侧，否则关节转动时舵盘会跟错连杆。灰色材质只用于区分结构件、舵机及五金件，不代表实物材质或颜色。

<a id="kinematics"></a>

## 关节与坐标

URDF 使用米和弧度；CAD 源数据为毫米。将原 CAD 绕 X 轴旋转 +90°，使原 Y 向上变成 URDF 的 Z 向上，再平移至基座底面 Z=0。所有滑块为 0° 时，还原 FCStd 装配姿态，**不代表实机编码器零位**。

| 关节 | 上游 → 下游 | 参考姿态下的轴向 | 舵机模型 |
| --- | --- | --- | --- |
| J1 | base_link → link_1 | +Z | RP8-U45H-M-C028 |
| J2 | link_1 → link_2 | +X | RP8-U45H-M |
| J3 | link_2 → link_3 | +X | RP8-U45H-M |
| J4 | link_3 → link_4 | +X | RP8-U45H-M |
| J5 | link_4 → link_5 | +Z | RP8-U45H-M-C028 |
| J6 | link_5 → link_6 | −Y | RP8-U45H-M-C028 |

轴线从舵盘圆柱面提取，并与下游结构件的同轴圆柱面交叉核对。连杆按基座到手柄的结构顺序划分；轴线数值、FCStd 对象标识及实体归属见 `kinematics.json`。A000、B000 已从当前源模型及输出网格中移除；保留源文件仍包含的垫片和五个紧固件，不增加第七个驱动轴或夹爪运动。

<a id="confirmation"></a>

## 待确认参数

- **关节限位**：源 FCStd 没有可用于 URDF 的运动范围参数。URDF 暂用 `continuous` 表示可视化旋转；这不代表实机支持无限旋转。界面 ±90° 也只是演示范围。移除限位块的视觉几何不等于确认实际运动范围；取得限位后应改为 `revolute` 并填入实际参数。
- **零位与方向**：编码器零位、正方向、舵机 ID 与真实关节对应关系仍需实物校准。
- **附件归属**：保留的垫片和紧固件的固定归属需要按实物装配复核。
- **动力学与控制**：未填入质量、惯量、力矩、速度、碰撞网格、传动或控制接口。当前包不能作为已标定的动力学或实机控制模型。
- **软件集成**：提供通用 URDF 与网格目录，未制作 ROS 启动包，也未在 RViz／Gazebo 上运行验收。使用 ROS 时需按目标环境处理资源路径并补充相关配置。

<a id="validation"></a>

## 验证与重新生成

| 检查 | 结果 |
| --- | --- |
| URDF 连接树 | 单根 base_link，7 个连杆、6 个活动关节，无重复父子关系 |
| 独立解析 | urdf_parser_py 0.0.4 成功解析 |
| 源实体与限位块 | 97 个源实体全部唯一归属；舵机替换后 100 个实体，输出不含 A000／B000 |
| 网格引用与单位 | 21 个二进制 STL，182,708 个三角面；米制路径与校验值通过，无残留旧网格 |
| 零位外形尺寸 | 约 105 × 305.133 × 191.514 mm；基座底面 Z≈0 |
| 转轴核对 | 舵盘与相邻结构件同轴误差低于 0.000001 mm（数值一致性，不是制造精度） |
| 浏览器操作 | 已验证六轴滑块、复位及连杆着色；模型正常加载 |
| 实机与动力学 | 尚未验证 |

在仓库根目录，以 FreeCAD Python 重新生成模型，再用普通 Python 检查：

```bash
PYTHONPATH=/Applications/FreeCAD.app/Contents/Resources/lib \
  /Applications/FreeCAD.app/Contents/Resources/bin/python scripts/generate_urdf.py
python scripts/check_urdf.py
python scripts/package_urdf.py
```

生成版本使用 FreeCAD 1.1.4。网格线性离散参数为 0.12 mm，角度离散参数为 0.35 rad；这些是显示网格参数，不是制造公差。源 FCStd 的 SHA-256 已锁定；更新源文件时需复核脚本内的装配对象映射并更新校验值。源装配体、舵机替换校验与转轴匹配任一变化时，应重新复核连接关系与预览。

浏览器预览使用 Three.js 0.180.0，已包含其 [MIT 许可](preview/THREE-LICENSE.txt)。`preview/viewer.js` 是源码，`preview/app.js` 为 esbuild 0.25.10 生成的离线模块；构建方法见 [维护说明](../../scripts/README.md)。URDF 的关节格式可参考 [ROS 官方 URDF 示例](https://github.com/ros/urdf_tutorial/blob/ros2/urdf/06-flexible.urdf)。
