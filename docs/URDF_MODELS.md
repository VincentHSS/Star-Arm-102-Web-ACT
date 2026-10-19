# FL / LD 虚拟手臂

在 Star Arm 102 控制台左侧，将 Follower 类型切换为「虚拟手臂」，再从「虚拟型号」选择新增的 FL · LumosTouch V3 或 LD · Touch R1。模型显示在原来的三维区域。点击「连接虚拟手臂」，连接 Leader 后按原流程开始跟随；切换型号前先停止并断开连接。Windows 本地包双击 `start_windows_urdf.bat` 打开控制台。模型资源均随网页提供。

- FL · LumosTouch V3：用户提供的 FL URDF，六轴及两个平移夹指。夹指滑块单位为毫米，旋转关节为角度。
- LD · Touch R1：用户指定的 Touch R1 Leader Arm 描述，六轴、七个连杆、21 份结构/舵机/舵盘网格。保留各零件原有连杆归属。

拖动旋转模型，滚轮缩放，右键平移。六个关节按 J1–J6 顺序在原 URDF 轴线上跟随；FL 的 J7 以 0–90° 对应双夹指各 0–42.5 mm 位移，LD 无夹爪。FL 显示范围受其 URDF 限位约束，LD 连续关节保留输入角度。此处的角度和夹指比例用于虚拟显示，尚未验证与实际新机型的零位、方向一致。

新型号使用现有虚拟 Follower 通道，不连接实体 Follower 串口。两个新虚拟型号不使用旧 FL 的 TCP / IK 和实机发送入口。现有实体型号仍使用原配置。

如需单独检查原始关节结构，可打开 `urdf-preview.html` 使用逐轴滑块、恢复零位和完整显示功能。

源码资源位于 `Browser_SDK/assets/urdf/fl-v3/` 和 `ld-touch/`。`source.urdf` 为原文，`model.urdf` 为可移动目录的相对路径版本；使用时保留旁边的 `meshes/`。来源见根目录 `THIRD_PARTY.md`。
