# Touch R1 与 LumosTouch V3

在 Star Arm 102 控制台左侧，「Leader 类型」可选择 Touch R1；将 Follower 类型切换为「虚拟手臂」后，「虚拟型号」可选择 LumosTouch V3。模型显示在原来的三维区域。切换型号前先停止并断开连接。Windows 本地包双击 `start_windows_urdf.bat` 打开控制台。模型资源均随网页提供。

- LumosTouch V3：用户提供的 FL URDF，六轴及两个平移夹指，作为虚拟 Follower。
- Touch R1：用户指定的 Leader Arm 描述，六轴、七个连杆、22 份结构/舵机/舵盘网格，含末端夹爪舵机。保留上游 21 份网格及各零件原有连杆归属。

Touch R1 使用 FashionStar 串口读取流程，查询 ID 0–5 的六个关节和 ID 6 的夹爪，不向 Leader 发送运动或扭矩命令。上游 URDF 描述六轴本体，实体夹爪输入按遥操作程序单独读取；编码器零点、方向与 CAD 坐标仍需实机确认。

上游文件包含六轴本体，末端手柄未带夹爪舵机。夹爪舵机采用原 Star Arm 102-LD `link6.STL` 中独立的电机实体，按 Touch R1 新支架的三个安装孔及机身槽对位后，作为 `link_6-gripper-servo.stl` 固定在手柄上。原握柄结构不重复加入；第六轴腕部电机及其舵盘保持原归属。提取来源、刚体变换、孔位误差与装配间隙见 `gripper-servo.json`，可用 `python tools/build_touch_gripper_visual.py --check` 复核。

这是显示模型的装配配准，轴向位置沿用旧电机的前安装面间隙，不是制造公差或实机标定。补充的是电机本体外观，未增加虚构的手柄运动关节。实体 ID 6 的读取、夹爪端点校准及遥操作继续使用现有流程。

实体型号中新增 LumosTouch V3，只允许已连接的 Touch R1 遥操作。实体 Star Arm 102-FL 保留 LD / HD 配对，不能与 Touch R1 混用。LumosTouch 通过 Ubuntu 本机 CAN 组件连接，不能沿用原 FL 的串口协议、轨迹回放或滑块/TCP 控制。连接、当次校准、目标预览与开始跟随见 [LumosTouch 遥操作](LUMOS_TELEOP.md)。

LumosTouch V3 使用现有虚拟 Follower 通道，六个关节按 J1–J6 顺序在原 URDF 轴线上跟随。虚拟预览的 J7 以 0–90° 对应双夹指各 0–42.5 mm 位移；实体 LumosTouch 的夹爪按当次闭合/张开校准映射为开度比例，并使用 SDK 反馈显示真实开度。显示范围受 URDF 限位约束，Touch R1 连续关节保留输入角度。新模型不使用旧 FL 的 TCP / IK 控制入口。

三个页面顶部使用统一的「当前工作区」菜单，切换控制台、ACT 工作台和网页执行；切换时继续停止控制并释放设备。

如需单独检查原始关节结构，可打开 `urdf-preview.html` 使用逐轴滑块、恢复零位和完整显示功能。

源码资源位于 `Browser_SDK/assets/urdf/fl-v3/` 和 `ld-touch/`。Touch R1 已固定更新到上游 `7c6811913e0928b04a2ad69d6ab25b7f22217ee5`：新装配移除 A000 / B000 限位块，21 份网格重新生成；六轴关节树和坐标未变。`SOURCE.json` 记录来源及校验信息。

`source.urdf` 为上游原文；Touch R1 的 `model.urdf` 使用相对路径，并包含补充的夹爪舵机外观，配套网格均在旁边的 `meshes/`。来源见根目录 `THIRD_PARTY.md`。URDF 用于几何显示，不构成真实手臂的控制标定或实机验证。
