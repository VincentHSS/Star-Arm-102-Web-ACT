# Touch R1 与 LumosTouch V3

在 Star Arm 102 控制台左侧，「Leader 类型」可选择 Touch R1；将 Follower 类型切换为「虚拟手臂」后，「虚拟型号」可选择 LumosTouch V3。模型显示在原来的三维区域。切换型号前先停止并断开连接。Windows 本地包双击 `start_windows_urdf.bat` 打开控制台。模型资源均随网页提供。

- LumosTouch V3：用户提供的 FL URDF，六轴及两个平移夹指，作为虚拟 Follower。
- Touch R1：用户指定的 Leader Arm 描述，六轴、七个连杆、21 份结构/舵机/舵盘网格。保留各零件原有连杆归属。

Touch R1 使用现有 FashionStar 串口读取流程，查询 ID 0–5 的六个关节，仅采集姿态。内部第七通道为占位值；开始跟随时不会向实体 Follower 的 J7 发送角度命令，保留其当前夹爪位置。它的编码器零点、方向与 CAD 坐标仍需实机确认。

LumosTouch V3 使用现有虚拟 Follower 通道，六个关节按 J1–J6 顺序在原 URDF 轴线上跟随。带夹爪输入的 Leader，其 J7 以 0–90° 对应双夹指各 0–42.5 mm 位移；Touch R1 不提供夹爪输入。LumosTouch 的显示范围受其 URDF 限位约束，Touch R1 连续关节保留输入角度。新模型不使用旧 FL 的 TCP / IK 控制入口。

三个页面顶部使用统一的「当前工作区」菜单，切换控制台、ACT 工作台和网页执行；切换时继续停止控制并释放设备。

如需单独检查原始关节结构，可打开 `urdf-preview.html` 使用逐轴滑块、恢复零位和完整显示功能。

源码资源位于 `Browser_SDK/assets/urdf/fl-v3/` 和 `ld-touch/`。`source.urdf` 为原文，`model.urdf` 为可移动目录的相对路径版本；使用时保留旁边的 `meshes/`。来源见根目录 `THIRD_PARTY.md`。
