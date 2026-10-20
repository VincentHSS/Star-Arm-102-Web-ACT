# Touch R1 与 LumosTouch V3

在 Star Arm 102 控制台左侧，「Leader 类型」可选择 Touch R1；将 Follower 类型切换为「虚拟手臂」后，「虚拟型号」可选择 LumosTouch V3。模型显示在原来的三维区域。切换型号前先停止并断开连接。Windows 本地包双击 `start_windows_urdf.bat` 打开控制台。模型资源均随网页提供。

- LumosTouch V3：用户提供的 FL URDF，六轴及两个平移夹指，作为虚拟 Follower。
- Touch R1 V3.2：七颗舵机、完整手柄和左右夹指，9 个连杆、7 个独立关节与 1 个从动关节，25 份上游视觉网格，共 214,230 个三角面。

Touch R1 的 J1–J6 控制手臂，J7 驱动右夹指，左夹指读取 URDF 的 `mimic joint_7`、倍率 −1、偏置 0 进行反向联动。J7 舵机机壳属于手柄 `link_6`，舵盘属于 `right_finger`；两个夹指分别连接在手柄上。所有几何、坐标和连杆归属均来自上游完整装配。

Touch R1 使用 FashionStar 串口读取流程，查询 ID 0–5 的六个关节和 ID 6 的夹爪，不向 Leader 发送运动或扭矩命令。显示使用收到的七通道角度；CAD 零位不等于编码器零位，实机方向、零点和行程仍需单独校准。上游双夹指 1:1 反向关系为 CAD 推定，不构成实机传动或碰撞验证。

实体 LumosTouch V3 只允许已连接的 Touch R1 遥操作。实体 Star Arm 102-FL 保留 LD / HD 配对。LumosTouch 通过 Ubuntu 本机 CAN 组件连接，不能沿用原 FL 的串口协议、轨迹回放或滑块/TCP 控制。连接、当次校准、目标预览与开始跟随见 [LumosTouch 遥操作](LUMOS_TELEOP.md)。本次模型更新不改变设备驱动、配对或实体夹爪校准。

LumosTouch V3 使用现有虚拟 Follower 通道，六个关节按 J1–J6 顺序在原 URDF 轴线上跟随。虚拟预览的 J7 以 0–90° 对应双夹指各 0–42.5 mm 位移；实体夹爪按当次闭合/张开校准映射为开度比例，并使用 SDK 反馈显示真实开度。新模型不使用旧 FL 的 TCP / IK 控制入口。

三个页面顶部使用统一的「当前工作区」菜单，切换控制台、ACT 工作台和网页执行；切换时停止控制并释放设备。

单独检查关节结构时，打开 `urdf-preview.html`，选择 Touch R1，使用七个独立滑块、恢复零位和完整显示。J1–J6 的 ±90° 与 J7 的 0–25° 仅为上游建议的演示范围；左夹指随 J7 自动联动，没有独立滑块。预览不连接硬件。

源码资源位于 `Browser_SDK/assets/urdf/fl-v3/` 和 `ld-touch/`。Touch R1 固定为上游 [e264ed0d](https://github.com/servodevelop/touch-r1-leader-arm/tree/e264ed0dc7bd209fdf63c11bc2f6061e2598fc05/hardware/robot-description) 的 V3.2 完整装配。`SOURCE.json` 记录来源、SHA-256 与验证边界；`source.urdf`、`upstream-README.md`、`kinematics.json` 和 25 份网格保留上游字节。`model.urdf` 仅将网格路径调整为同目录 `meshes/`，不添加额外几何或修改关节。

使用 `python tools/check_touch_model.py` 核验网格、关节与来源。上游 `continuous` 只用于可视化，不表示实机可无限旋转。此 URDF 未提供质量、惯量、驱动或真实控制标定；自动检查与浏览器预览不等于实机验证。来源见根目录 `THIRD_PARTY.md`。
