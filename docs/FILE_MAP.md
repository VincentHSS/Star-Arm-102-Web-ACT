# 每个文件的用途

自动清单覆盖所有源码、教程、测试和静态资源；不包含 `.git`、环境、缓存、生成包或客户数据。

| 目录 | 用途 |
| --- | --- |
| `Browser_SDK/` | 可直接上传的静态网站 |
| `ai_service/` | 客户电脑执行的后台 |
| `runtime/` | Ubuntu 组件和会话启动 |
| `tools/` | 本地启动、构建与发布校验 |
| `tests/` | 软件与浏览器检查 |
| `docs/` | 中文教程与文件说明 |

| 文件 | 作用 |
| --- | --- |
| [.gitattributes](../.gitattributes) | 固定 Linux 脚本 LF、Windows 脚本 CRLF 与二进制资源属性 |
| [.github/workflows/ci.yml](../.github/workflows/ci.yml) | GitHub 自动软件测试、组件校验与文件说明检查 |
| [.gitignore](../.gitignore) | 排除客户数据、模型、环境、缓存、日志和生成包 |
| [Browser_SDK/act-browser.html](../Browser_SDK/act-browser.html) | 客户无需本机服务的 ACT 模型、双相机与串口执行网页 |
| [Browser_SDK/act-workbench.html](../Browser_SDK/act-workbench.html) | ACT 采集、训练、模型和执行四步骤页面 |
| [Browser_SDK/assets/icon.png](../Browser_SDK/assets/icon.png) | 网站图标 |
| [Browser_SDK/assets/logo-full.png](../Browser_SDK/assets/logo-full.png) | 完整品牌图像 |
| [Browser_SDK/assets/logo-icon.png](../Browser_SDK/assets/logo-icon.png) | 品牌图标与组件桌面图标 |
| [Browser_SDK/assets/logo.svg](../Browser_SDK/assets/logo.svg) | 品牌矢量图标 |
| [Browser_SDK/assets/models/a1z-gripper/arm_link1.STL](../Browser_SDK/assets/models/a1z-gripper/arm_link1.STL) | a1z-gripper 模型的 arm_link1 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/arm_link2.stl](../Browser_SDK/assets/models/a1z-gripper/arm_link2.stl) | a1z-gripper 模型的 arm_link2 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/arm_link3.stl](../Browser_SDK/assets/models/a1z-gripper/arm_link3.stl) | a1z-gripper 模型的 arm_link3 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/arm_link4.stl](../Browser_SDK/assets/models/a1z-gripper/arm_link4.stl) | a1z-gripper 模型的 arm_link4 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/arm_link5.stl](../Browser_SDK/assets/models/a1z-gripper/arm_link5.stl) | a1z-gripper 模型的 arm_link5 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/arm_link6.stl](../Browser_SDK/assets/models/a1z-gripper/arm_link6.stl) | a1z-gripper 模型的 arm_link6 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/base_link.stl](../Browser_SDK/assets/models/a1z-gripper/base_link.stl) | a1z-gripper 模型的 base_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/gripper_finger_left_link.stl](../Browser_SDK/assets/models/a1z-gripper/gripper_finger_left_link.stl) | a1z-gripper 模型的 gripper_finger_left_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z-gripper/gripper_finger_right_link.stl](../Browser_SDK/assets/models/a1z-gripper/gripper_finger_right_link.stl) | a1z-gripper 模型的 gripper_finger_right_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/arm_link1.STL](../Browser_SDK/assets/models/a1z/arm_link1.STL) | a1z 模型的 arm_link1 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/arm_link2.STL](../Browser_SDK/assets/models/a1z/arm_link2.STL) | a1z 模型的 arm_link2 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/arm_link3.STL](../Browser_SDK/assets/models/a1z/arm_link3.STL) | a1z 模型的 arm_link3 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/arm_link4.STL](../Browser_SDK/assets/models/a1z/arm_link4.STL) | a1z 模型的 arm_link4 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/arm_link5.STL](../Browser_SDK/assets/models/a1z/arm_link5.STL) | a1z 模型的 arm_link5 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/arm_link6.STL](../Browser_SDK/assets/models/a1z/arm_link6.STL) | a1z 模型的 arm_link6 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/base_link.STL](../Browser_SDK/assets/models/a1z/base_link.STL) | a1z 模型的 base_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/gripper_finger_left_link.STL](../Browser_SDK/assets/models/a1z/gripper_finger_left_link.STL) | a1z 模型的 gripper_finger_left_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/a1z/gripper_finger_right_link.STL](../Browser_SDK/assets/models/a1z/gripper_finger_right_link.STL) | a1z 模型的 gripper_finger_right_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601-gripper/gripper_left.STL](../Browser_SDK/assets/models/b601-gripper/gripper_left.STL) | b601-gripper 模型的 gripper_left 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601-gripper/gripper_link.STL](../Browser_SDK/assets/models/b601-gripper/gripper_link.STL) | b601-gripper 模型的 gripper_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601-gripper/gripper_right.STL](../Browser_SDK/assets/models/b601-gripper/gripper_right.STL) | b601-gripper 模型的 gripper_right 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601-gripper/link6.STL](../Browser_SDK/assets/models/b601-gripper/link6.STL) | b601-gripper 模型的 link6 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/base_link.STL](../Browser_SDK/assets/models/b601/base_link.STL) | b601 模型的 base_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/end_link.STL](../Browser_SDK/assets/models/b601/end_link.STL) | b601 模型的 end_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/link1.STL](../Browser_SDK/assets/models/b601/link1.STL) | b601 模型的 link1 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/link2.STL](../Browser_SDK/assets/models/b601/link2.STL) | b601 模型的 link2 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/link3.STL](../Browser_SDK/assets/models/b601/link3.STL) | b601 模型的 link3 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/link4.STL](../Browser_SDK/assets/models/b601/link4.STL) | b601 模型的 link4 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/link5.STL](../Browser_SDK/assets/models/b601/link5.STL) | b601 模型的 link5 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/b601/link6.STL](../Browser_SDK/assets/models/b601/link6.STL) | b601 模型的 link6 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/base_link.STL](../Browser_SDK/assets/models/fl/base_link.STL) | fl 模型的 base_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link1.STL](../Browser_SDK/assets/models/fl/link1.STL) | fl 模型的 link1 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link2.STL](../Browser_SDK/assets/models/fl/link2.STL) | fl 模型的 link2 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link3.STL](../Browser_SDK/assets/models/fl/link3.STL) | fl 模型的 link3 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link4.STL](../Browser_SDK/assets/models/fl/link4.STL) | fl 模型的 link4 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link5.STL](../Browser_SDK/assets/models/fl/link5.STL) | fl 模型的 link5 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link6.STL](../Browser_SDK/assets/models/fl/link6.STL) | fl 模型的 link6 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link7_left.STL](../Browser_SDK/assets/models/fl/link7_left.STL) | fl 模型的 link7_left 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/fl/link7_right.STL](../Browser_SDK/assets/models/fl/link7_right.STL) | fl 模型的 link7_right 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/base_link.STL](../Browser_SDK/assets/models/ld/base_link.STL) | ld 模型的 base_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link1.STL](../Browser_SDK/assets/models/ld/link1.STL) | ld 模型的 link1 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link2.STL](../Browser_SDK/assets/models/ld/link2.STL) | ld 模型的 link2 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link3.STL](../Browser_SDK/assets/models/ld/link3.STL) | ld 模型的 link3 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link4.STL](../Browser_SDK/assets/models/ld/link4.STL) | ld 模型的 link4 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link5.STL](../Browser_SDK/assets/models/ld/link5.STL) | ld 模型的 link5 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link6.STL](../Browser_SDK/assets/models/ld/link6.STL) | ld 模型的 link6 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link7_left.STL](../Browser_SDK/assets/models/ld/link7_left.STL) | ld 模型的 link7_left 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/ld/link7_right.STL](../Browser_SDK/assets/models/ld/link7_right.STL) | ld 模型的 link7_right 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/base_link.STL](../Browser_SDK/assets/models/piper/base_link.STL) | piper 模型的 base_link 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link1.STL](../Browser_SDK/assets/models/piper/link1.STL) | piper 模型的 link1 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link2.STL](../Browser_SDK/assets/models/piper/link2.STL) | piper 模型的 link2 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link3.STL](../Browser_SDK/assets/models/piper/link3.STL) | piper 模型的 link3 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link4.STL](../Browser_SDK/assets/models/piper/link4.STL) | piper 模型的 link4 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link6.STL](../Browser_SDK/assets/models/piper/link6.STL) | piper 模型的 link6 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link7_left.STL](../Browser_SDK/assets/models/piper/link7_left.STL) | piper 模型的 link7_left 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link7_right.STL](../Browser_SDK/assets/models/piper/link7_right.STL) | piper 模型的 link7_right 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/models/piper/link_5.STL](../Browser_SDK/assets/models/piper/link_5.STL) | piper 模型的 link_5 零件三角网格，用于 3D 显示 |
| [Browser_SDK/assets/resource-manifest.json](../Browser_SDK/assets/resource-manifest.json) | 本地模型与显示资源清单 |
| [Browser_SDK/assets/urdf/a1z/A1Z_G1Z_with_gripper.urdf](../Browser_SDK/assets/urdf/a1z/A1Z_G1Z_with_gripper.urdf) | a1z 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/a1z/model.urdf](../Browser_SDK/assets/urdf/a1z/model.urdf) | a1z 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/b601/reBot-DevArm_fixend.csv](../Browser_SDK/assets/urdf/b601/reBot-DevArm_fixend.csv) | b601 模型的 CAD 导出的关节配置表 |
| [Browser_SDK/assets/urdf/b601/reBot-DevArm_fixend.urdf](../Browser_SDK/assets/urdf/b601/reBot-DevArm_fixend.urdf) | b601 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/b601/reBot_B601_DM_with_gripper.urdf](../Browser_SDK/assets/urdf/b601/reBot_B601_DM_with_gripper.urdf) | b601 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/fl-v3/meshes/base_link.STL](../Browser_SDK/assets/urdf/fl-v3/meshes/base_link.STL) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/fl-v3/meshes/gripper_base.STL](../Browser_SDK/assets/urdf/fl-v3/meshes/gripper_base.STL) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/fl-v3/meshes/gripper_link1.STL](../Browser_SDK/assets/urdf/fl-v3/meshes/gripper_link1.STL) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/fl-v3/meshes/gripper_link2.STL](../Browser_SDK/assets/urdf/fl-v3/meshes/gripper_link2.STL) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/fl-v3/meshes/link1.STL](../Browser_SDK/assets/urdf/fl-v3/meshes/link1.STL) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/fl-v3/meshes/link2.STL](../Browser_SDK/assets/urdf/fl-v3/meshes/link2.STL) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/fl-v3/meshes/link3.STL](../Browser_SDK/assets/urdf/fl-v3/meshes/link3.STL) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/fl-v3/meshes/link4.STL](../Browser_SDK/assets/urdf/fl-v3/meshes/link4.STL) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/fl-v3/meshes/link5.STL](../Browser_SDK/assets/urdf/fl-v3/meshes/link5.STL) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/fl-v3/model.urdf](../Browser_SDK/assets/urdf/fl-v3/model.urdf) | fl-v3 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/fl-v3/source.urdf](../Browser_SDK/assets/urdf/fl-v3/source.urdf) | fl-v3 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/ld-touch/SOURCE.json](../Browser_SDK/assets/urdf/ld-touch/SOURCE.json) | Touch R1 上游固定提交与资源校验清单 |
| [Browser_SDK/assets/urdf/ld-touch/kinematics.json](../Browser_SDK/assets/urdf/ld-touch/kinematics.json) | Touch R1 上游关节坐标、几何生成和源文件校验报告 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/base_link-hardware.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/base_link-hardware.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/base_link-servo.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/base_link-servo.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/base_link-structure.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/base_link-structure.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/left_finger-finger.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/left_finger-finger.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_1-horn.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_1-horn.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_1-servo.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_1-servo.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_1-structure.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_1-structure.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_2-horn.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_2-horn.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_2-servo.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_2-servo.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_2-structure.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_2-structure.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_3-horn.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_3-horn.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_3-servo.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_3-servo.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_3-structure.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_3-structure.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_4-horn.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_4-horn.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_4-servo.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_4-servo.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_4-structure.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_4-structure.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_5-hardware.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_5-hardware.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_5-horn.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_5-horn.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_5-servo.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_5-servo.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_5-structure.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_5-structure.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_6-horn.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_6-horn.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_6-servo.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_6-servo.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/link_6-structure.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/link_6-structure.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/right_finger-finger.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/right_finger-finger.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/meshes/right_finger-horn.stl](../Browser_SDK/assets/urdf/ld-touch/meshes/right_finger-horn.stl) | meshes 模型的 原始三角网格 |
| [Browser_SDK/assets/urdf/ld-touch/model.urdf](../Browser_SDK/assets/urdf/ld-touch/model.urdf) | ld-touch 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/ld-touch/source.urdf](../Browser_SDK/assets/urdf/ld-touch/source.urdf) | ld-touch 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/ld-touch/upstream-README.md](../Browser_SDK/assets/urdf/ld-touch/upstream-README.md) | Touch R1 上游模型原始说明与实机标定边界 |
| [Browser_SDK/assets/urdf/ld/model.urdf](../Browser_SDK/assets/urdf/ld/model.urdf) | ld 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/piper/export_report.json](../Browser_SDK/assets/urdf/piper/export_report.json) | piper 模型的 模型导出坐标与警告报告 |
| [Browser_SDK/assets/urdf/piper/model.urdf](../Browser_SDK/assets/urdf/piper/model.urdf) | piper 模型的 关节、坐标和连杆结构 |
| [Browser_SDK/assets/urdf/piper/parts.json](../Browser_SDK/assets/urdf/piper/parts.json) | piper 模型的 导出零件映射 |
| [Browser_SDK/assets/vendor/OrbitControls.js](../Browser_SDK/assets/vendor/OrbitControls.js) | 3D 视角旋转、缩放与平移控件 |
| [Browser_SDK/assets/vendor/STLLoader.js](../Browser_SDK/assets/vendor/STLLoader.js) | 加载机械臂 STL 三角网格 |
| [Browser_SDK/assets/vendor/fflate/LICENSE.txt](../Browser_SDK/assets/vendor/fflate/LICENSE.txt) | fflate 的 MIT 许可证 |
| [Browser_SDK/assets/vendor/fflate/browser.js](../Browser_SDK/assets/vendor/fflate/browser.js) | 网页模型 ZIP 解压库，运行在 Worker 中 |
| [Browser_SDK/assets/vendor/fflate/package-version.json](../Browser_SDK/assets/vendor/fflate/package-version.json) | npm 原包版本和 SHA512 完整性信息 |
| [Browser_SDK/assets/vendor/lucide-LICENSE.txt](../Browser_SDK/assets/vendor/lucide-LICENSE.txt) | Lucide 图标原始 ISC 许可证与来源版权声明 |
| [Browser_SDK/assets/vendor/lucide-icons.svg](../Browser_SDK/assets/vendor/lucide-icons.svg) | 自托管 Lucide 0.468.0 开源图标精灵，用于舵机配置页面 |
| [Browser_SDK/assets/vendor/onnxruntime-web/LICENSE.txt](../Browser_SDK/assets/vendor/onnxruntime-web/LICENSE.txt) | ONNX Runtime Web 的 MIT 许可证 |
| [Browser_SDK/assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.js](../Browser_SDK/assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.js) | WebGPU 引擎的异步 WASM 模块胶水代码 |
| [Browser_SDK/assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm](../Browser_SDK/assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm) | 浏览器直接运行的 WebGPU / WASM 推理实现 |
| [Browser_SDK/assets/vendor/onnxruntime-web/ort.webgpu.min.js](../Browser_SDK/assets/vendor/onnxruntime-web/ort.webgpu.min.js) | 自托管 ONNX Runtime WebGPU JavaScript 引擎入口 |
| [Browser_SDK/assets/vendor/onnxruntime-web/package-version.json](../Browser_SDK/assets/vendor/onnxruntime-web/package-version.json) | npm 原包版本和 SHA512 完整性信息 |
| [Browser_SDK/assets/vendor/three.core.js](../Browser_SDK/assets/vendor/three.core.js) | Three.js 几何、场景、材质与数学核心 |
| [Browser_SDK/assets/vendor/three.module.js](../Browser_SDK/assets/vendor/three.module.js) | Three.js 模块入口与 WebGL 实现 |
| [Browser_SDK/downloads/act-runtime-template.deb](../Browser_SDK/downloads/act-runtime-template.deb) | 通用 Ubuntu 组件模板，由网页绑定当前网站后下载 |
| [Browser_SDK/index.html](../Browser_SDK/index.html) | Star Arm 102 控制台首页 |
| [Browser_SDK/src/a1z_model_data.js](../Browser_SDK/src/a1z_model_data.js) | A1Z 3D 零件与关节数据 |
| [Browser_SDK/src/act-browser-app.js](../Browser_SDK/src/act-browser-app.js) | Windows 纯网页模型导入、相机串口授权、校验与执行界面 |
| [Browser_SDK/src/act-browser-core.js](../Browser_SDK/src/act-browser-core.js) | 网页模型合同、原版校准坐标转换、限位与时间索引动作调度 |
| [Browser_SDK/src/act-browser-runtime.js](../Browser_SDK/src/act-browser-runtime.js) | 浏览器 Worker 推理与串口控制、实时反馈、停止和资源释放 |
| [Browser_SDK/src/act-browser-worker.js](../Browser_SDK/src/act-browser-worker.js) | 隔离线程校验模型包，加载 WebGPU 引擎并计算完整 ACT 动作块 |
| [Browser_SDK/src/act-browser.css](../Browser_SDK/src/act-browser.css) | 纯网页执行入口的布局、侧栏滚动与过渡样式（样式） |
| [Browser_SDK/src/act-camera-frame-encoder-worker-client.js](../Browser_SDK/src/act-camera-frame-encoder-worker-client.js) | 管理相机编码 Worker 请求、超时与退出 |
| [Browser_SDK/src/act-camera-frame-encoder-worker.js](../Browser_SDK/src/act-camera-frame-encoder-worker.js) | 在后台 Worker 中编码相机 JPEG，减少主界面阻塞 |
| [Browser_SDK/src/act-camera-frame-uploader.js](../Browser_SDK/src/act-camera-frame-uploader.js) | 管理双相机帧上传队列、批次与结束排空 |
| [Browser_SDK/src/act-camera-state.js](../Browser_SDK/src/act-camera-state.js) | 统一相机连接、采集和丢帧状态 |
| [Browser_SDK/src/act-cameras.js](../Browser_SDK/src/act-cameras.js) | ACT 相机设备选择、角色绑定与预览 |
| [Browser_SDK/src/act-capture-quality.js](../Browser_SDK/src/act-capture-quality.js) | 采集同步质量和帧率统计 |
| [Browser_SDK/src/act-inference.css](../Browser_SDK/src/act-inference.css) | 执行诊断面板与推理界面样式（样式） |
| [Browser_SDK/src/act-installer.js](../Browser_SDK/src/act-installer.js) | 验证模板并生成绑定当前网站的 Ubuntu 安装包 |
| [Browser_SDK/src/act-motion.js](../Browser_SDK/src/act-motion.js) | ACT 元素出现、退出和交互过渡 |
| [Browser_SDK/src/act-ui-refresh.css](../Browser_SDK/src/act-ui-refresh.css) | ACT 面板布局、空相机状态与交互视觉样式（样式） |
| [Browser_SDK/src/act-waveform.js](../Browser_SDK/src/act-waveform.js) | Action / State 多通道曲线、时间轴与绘制 |
| [Browser_SDK/src/act-workbench.css](../Browser_SDK/src/act-workbench.css) | ACT 四步骤工作台的流程、API、采集、训练和模型执行交互（样式） |
| [Browser_SDK/src/act-workbench.js](../Browser_SDK/src/act-workbench.js) | ACT 四步骤工作台的流程、API、采集、训练和模型执行交互 |
| [Browser_SDK/src/api-client.js](../Browser_SDK/src/api-client.js) | 本机 API 请求与响应体超时、错误反馈和取消管理 |
| [Browser_SDK/src/app.js](../Browser_SDK/src/app.js) | 控制台入口：初始化 3D、机械臂、串口和界面事件 |
| [Browser_SDK/src/b601_model_data.js](../Browser_SDK/src/b601_model_data.js) | B601 显示模型的零件与关节数据 |
| [Browser_SDK/src/browser_serial_utils.js](../Browser_SDK/src/browser_serial_utils.js) | 浏览器串口超时、读取与可取消任务工具 |
| [Browser_SDK/src/command_execution.js](../Browser_SDK/src/command_execution.js) | 协调控制指令执行和停止 |
| [Browser_SDK/src/control_lifecycle.js](../Browser_SDK/src/control_lifecycle.js) | 管理控制会话生命周期与资源释放 |
| [Browser_SDK/src/control_safety.js](../Browser_SDK/src/control_safety.js) | 控制台运动限位、约束与安全检查 |
| [Browser_SDK/src/factory_params.js](../Browser_SDK/src/factory_params.js) | 舵机工厂参数定义、解析与验证 |
| [Browser_SDK/src/factory_restore.js](../Browser_SDK/src/factory_restore.js) | 恢复舵机工厂参数的流程 |
| [Browser_SDK/src/fashionstar_serial.js](../Browser_SDK/src/fashionstar_serial.js) | FashionStar 浏览器串口协议封装 |
| [Browser_SDK/src/fl_trajectory_controller.js](../Browser_SDK/src/fl_trajectory_controller.js) | 从臂轨迹播放、暂停、停止和指令调度 |
| [Browser_SDK/src/fl_trajectory_model.js](../Browser_SDK/src/fl_trajectory_model.js) | 从臂轨迹结构、插值与关节模型 |
| [Browser_SDK/src/fl_trajectory_preview.js](../Browser_SDK/src/fl_trajectory_preview.js) | 从臂轨迹的 3D 预览 |
| [Browser_SDK/src/fl_trajectory_store.js](../Browser_SDK/src/fl_trajectory_store.js) | 从臂轨迹持久化、导入与导出 |
| [Browser_SDK/src/fl_trajectory_styles.css](../Browser_SDK/src/fl_trajectory_styles.css) | 从臂轨迹编辑面板样式（样式） |
| [Browser_SDK/src/fl_trajectory_workspace.js](../Browser_SDK/src/fl_trajectory_workspace.js) | 从臂轨迹工作区界面和操作 |
| [Browser_SDK/src/follower_target.js](../Browser_SDK/src/follower_target.js) | 从臂目标与实际关节状态转换 |
| [Browser_SDK/src/i18n.js](../Browser_SDK/src/i18n.js) | 控制台中英文文本 |
| [Browser_SDK/src/ik_solver.js](../Browser_SDK/src/ik_solver.js) | 末端逆运动学求解 |
| [Browser_SDK/src/interaction.css](../Browser_SDK/src/interaction.css) | 按钮处理提示与页面切换状态样式（样式） |
| [Browser_SDK/src/joint_mapper.js](../Browser_SDK/src/joint_mapper.js) | 舵机角度与显示模型关节方向映射 |
| [Browser_SDK/src/joint_slider_control.js](../Browser_SDK/src/joint_slider_control.js) | 关节滑条输入与连续控制 |
| [Browser_SDK/src/local-service.js](../Browser_SDK/src/local-service.js) | 本机后台探测、组件下载与环境准备接续 |
| [Browser_SDK/src/lumos_client.js](../Browser_SDK/src/lumos_client.js) | 本机 Lumos CAN 会话、六轴与夹爪新鲜采样、网页校准与停止 |
| [Browser_SDK/src/manual_control_session.js](../Browser_SDK/src/manual_control_session.js) | 手动控制会话的启动、结束与指令管理 |
| [Browser_SDK/src/model_asset_loader.js](../Browser_SDK/src/model_asset_loader.js) | 模型网格有限并发、网络读取重试、错误定位与旧请求释放 |
| [Browser_SDK/src/page-lifecycle.js](../Browser_SDK/src/page-lifecycle.js) | 页面切换前停止控制、释放串口与按钮处理状态 |
| [Browser_SDK/src/piper_model_data.js](../Browser_SDK/src/piper_model_data.js) | PiPER Mate 烘焙模型与关节原始数据 |
| [Browser_SDK/src/rate_meter.js](../Browser_SDK/src/rate_meter.js) | 采样与通信频率统计 |
| [Browser_SDK/src/reset_origin.js](../Browser_SDK/src/reset_origin.js) | 机械臂回零与原点重置 |
| [Browser_SDK/src/robot_model.js](../Browser_SDK/src/robot_model.js) | 创建 3D 关节树并应用实际关节角度 |
| [Browser_SDK/src/robot_model_configs.js](../Browser_SDK/src/robot_model_configs.js) | 可选显示模型、关节与资源配置 |
| [Browser_SDK/src/robot_profiles.js](../Browser_SDK/src/robot_profiles.js) | 主从臂型号、关节范围和控制配置 |
| [Browser_SDK/src/runtime_integration.js](../Browser_SDK/src/runtime_integration.js) | 控制台运行状态与设备控制的集成 |
| [Browser_SDK/src/serial_servo_bus.js](../Browser_SDK/src/serial_servo_bus.js) | 舵机总线串口收发与响应管理 |
| [Browser_SDK/src/servo_bus_wizard.js](../Browser_SDK/src/servo_bus_wizard.js) | 一次启动自动检测七颗新舵机、编号、恢复 ID 0、统一速率与暂停接续 |
| [Browser_SDK/src/servo_readback.js](../Browser_SDK/src/servo_readback.js) | 控制台按 ID 收集回包、每轮统一超时、仅补读缺失关节与清理等待 |
| [Browser_SDK/src/servo_setup.css](../Browser_SDK/src/servo_setup.css) | LD 三维选舵机、逐颗总线配置与单颗参数编辑（样式） |
| [Browser_SDK/src/servo_setup.js](../Browser_SDK/src/servo_setup.js) | LD 三维选舵机、逐颗总线配置与单颗参数编辑 |
| [Browser_SDK/src/servo_setup_flow.js](../Browser_SDK/src/servo_setup_flow.js) | 舵机 ID 和波特率冲突探测、保留保护参数的写入核验与只读恢复 |
| [Browser_SDK/src/servo_setup_i18n.js](../Browser_SDK/src/servo_setup_i18n.js) | 舵机配置页面、步骤、错误与通信反馈的中英文文本 |
| [Browser_SDK/src/servo_setup_model.js](../Browser_SDK/src/servo_setup_model.js) | 配置页独立 LD 三维模型、网格点选、七颗编号与高亮 |
| [Browser_SDK/src/servo_setup_parts.js](../Browser_SDK/src/servo_setup_parts.js) | 从原始 LD CAD 生成的独立舵机机壳中心与精确三角面点选分组 |
| [Browser_SDK/src/settings.js](../Browser_SDK/src/settings.js) | 控制台用户设置与持久化 |
| [Browser_SDK/src/styles.css](../Browser_SDK/src/styles.css) | 控制台主题、响应式布局和通用控件样式（样式） |
| [Browser_SDK/src/supplied_urdf_mapping.js](../Browser_SDK/src/supplied_urdf_mapping.js) | Touch R1 Leader 和 LumosTouch 虚拟从臂的显示角度与夹指位移映射 |
| [Browser_SDK/src/supplied_urdf_models.js](../Browser_SDK/src/supplied_urdf_models.js) | 用户 FL 与 Touch R1 LD 原始关节树、视觉材质与网格引用 |
| [Browser_SDK/src/target_execution_ownership.js](../Browser_SDK/src/target_execution_ownership.js) | 确保运动目标同一时间由一个执行者持有 |
| [Browser_SDK/src/tcp_drag_preview.js](../Browser_SDK/src/tcp_drag_preview.js) | 拖动末端时的目标预览 |
| [Browser_SDK/src/tcp_translation_gizmo.js](../Browser_SDK/src/tcp_translation_gizmo.js) | 3D 末端平移操作控件 |
| [Browser_SDK/src/teleop_controller.js](../Browser_SDK/src/teleop_controller.js) | 主从臂遥操作与周期控制 |
| [Browser_SDK/src/teleop_pairing.js](../Browser_SDK/src/teleop_pairing.js) | 已连接主从型号配对策略，实体 LumosTouch 仅允许 Touch R1 |
| [Browser_SDK/src/training-submission.js](../Browser_SDK/src/training-submission.js) | 识别已提交训练任务与数据准备、训练、停止状态，避免超时后重复提交 |
| [Browser_SDK/src/urdf-preview.css](../Browser_SDK/src/urdf-preview.css) | URDF 模型大画布、关节侧栏及移动端布局 |
| [Browser_SDK/src/urdf-preview.js](../Browser_SDK/src/urdf-preview.js) | 独立 URDF 预览状态、旋转与平移关节滑块，不连接硬件 |
| [Browser_SDK/src/urdf_model_data.js](../Browser_SDK/src/urdf_model_data.js) | 原始机械臂 URDF 转换后的显示数据 |
| [Browser_SDK/src/version.js](../Browser_SDK/src/version.js) | 原控制台版本显示信息 |
| [Browser_SDK/src/workspace-nav.css](../Browser_SDK/src/workspace-nav.css) | 三页统一工作区导航与桌面、窄屏布局 |
| [Browser_SDK/src/workspace-nav.js](../Browser_SDK/src/workspace-nav.js) | 统一工作区下拉菜单的键盘、失焦收起及控制台标题高度同步 |
| [Browser_SDK/src/workspace-switch.css](../Browser_SDK/src/workspace-switch.css) | 控制台与 ACT 的全屏能量环切换、倒计时与取消（样式） |
| [Browser_SDK/src/workspace-switch.js](../Browser_SDK/src/workspace-switch.js) | 控制台与 ACT 的全屏能量环切换、倒计时与取消 |
| [Browser_SDK/urdf-preview.html](../Browser_SDK/urdf-preview.html) | 用户提供的 FL 与 Touch R1 LD 模型切换和逐轴姿态预览 |
| [README.md](../README.md) | 客户入口、下载选择、两系统启动与教程索引 |
| [THIRD_PARTY.md](../THIRD_PARTY.md) | 第三方组件来源、许可位置与资产说明 |
| [ai_service/__init__.py](../ai_service/__init__.py) | Python 后台包入口 |
| [ai_service/act_policy_worker.py](../ai_service/act_policy_worker.py) | 独立进程加载 ACT 策略并产生预测动作 |
| [ai_service/action_schedule.py](../ai_service/action_schedule.py) | 动作块队列、节拍调度与多次预测融合 |
| [ai_service/app.py](../ai_service/app.py) | 本机 HTTP API、静态页面与资源生命周期 |
| [ai_service/browser_export_worker.py](../ai_service/browser_export_worker.py) | 将 ACT 和处理器导出浏览器图，三组输入比对原版后打包 |
| [ai_service/browser_exports.py](../ai_service/browser_exports.py) | 训练端异步网页模型导出、依赖准备、状态与下载 |
| [ai_service/capabilities.py](../ai_service/capabilities.py) | 检测 Python、训练依赖、GPU 与运行阻碍 |
| [ai_service/devices.py](../ai_service/devices.py) | 设备枚举与稳定标识、角色绑定 |
| [ai_service/domain.py](../ai_service/domain.py) | 数据集、轮次、设备绑定与业务错误规则 |
| [ai_service/episode_data.py](../ai_service/episode_data.py) | 示教轮次、JPEG、索引、完整性及导入导出 |
| [ai_service/fashionstar_protocol.py](../ai_service/fashionstar_protocol.py) | FashionStar 原始协议打包、校验与反馈解析 |
| [ai_service/follower_calibration.py](../ai_service/follower_calibration.py) | 从臂校准记录、范围、JSON 与归一化转换 |
| [ai_service/inference_runtime.py](../ai_service/inference_runtime.py) | 策略进程、状态读取、动作调度与推理诊断 |
| [ai_service/lerobot_convert.py](../ai_service/lerobot_convert.py) | 将示教角度、相机和统计量转换到 LeRobot 数据约定 |
| [ai_service/lumos_runtime.py](../ai_service/lumos_runtime.py) | Ubuntu Lumos SDK 六轴与夹爪控制、当次校准、配对与失联看门狗 |
| [ai_service/model_import.py](../ai_service/model_import.py) | 完整模型包验证、发行包识别与导入整理 |
| [ai_service/native_act_driver.py](../ai_service/native_act_driver.py) | 原生 FashionStar SDK 适配与从臂读写、校准坐标转换 |
| [ai_service/native_cameras.py](../ai_service/native_cameras.py) | Ubuntu V4L2 双相机枚举、模式、JPEG 流与采集 |
| [ai_service/release_adapter.py](../ai_service/release_adapter.py) | 将上游发行模型的目录和配置适配为本工作台模型 |
| [ai_service/serial_connections.py](../ai_service/serial_connections.py) | Linux 主从臂串口连接、读取、写入与状态 |
| [ai_service/store.py](../ai_service/store.py) | 业务状态的本机持久化 |
| [ai_service/synchronizer.py](../ai_service/synchronizer.py) | 关节与相机样本时间同步 |
| [ai_service/telemetry.py](../ai_service/telemetry.py) | 实时状态和 SSE 遥测发布 |
| [ai_service/teleop_runtime.py](../ai_service/teleop_runtime.py) | 主从臂示教循环、滤波与真实样本发布 |
| [ai_service/training_dataset.py](../ai_service/training_dataset.py) | 训练数据准备、完整性检查与转换缓存 |
| [ai_service/training_environment.py](../ai_service/training_environment.py) | 独立 Python 环境准备、依赖安装与加速设备自检 |
| [ai_service/training_jobs.py](../ai_service/training_jobs.py) | 训练子进程、日志、检查点、停止与恢复 |
| [ai_service/training_manifest.json](../ai_service/training_manifest.json) | Python / LeRobot / PyTorch 版本及加速源清单 |
| [ai_service/vendor/README.txt](../ai_service/vendor/README.txt) | 离线原生 SDK / 串口 wheel 来源与 SHA256 |
| [ai_service/vendor/fashionstar_uart_sdk-1.3.6-py3-none-any.whl](../ai_service/vendor/fashionstar_uart_sdk-1.3.6-py3-none-any.whl) | FashionStar 官方 UART SDK 1.3.6 离线依赖 |
| [ai_service/vendor/fashionstar_uart_sdk-1.3.6-py3-none-any.whl.LICENSE.txt](../ai_service/vendor/fashionstar_uart_sdk-1.3.6-py3-none-any.whl.LICENSE.txt) | FashionStar SDK 随附的原始许可文本 |
| [ai_service/vendor/pyserial-3.5-py2.py3-none-any.whl](../ai_service/vendor/pyserial-3.5-py2.py3-none-any.whl) | pyserial 3.5 离线串口依赖，wheel 内含许可 |
| [ai_service/website_authorization.py](../ai_service/website_authorization.py) | Windows 当前网站连接确认、限时单次令牌与确认界面 |
| [ai_service/windows_cameras.py](../ai_service/windows_cameras.py) | Windows DirectShow 双相机枚举、模式和原生 JPEG 视频流 |
| [delivery/README.md](../delivery/README.md) | 最新完整交付的下载、运行与打包入口 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/logo-icon.png](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/logo-icon.png) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/011d60e7ac091d136a2ecb98.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/011d60e7ac091d136a2ecb98.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/0d413a2d34b308d42827e8b3.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/0d413a2d34b308d42827e8b3.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/0e5a266d6513a5c31ed1df0b.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/0e5a266d6513a5c31ed1df0b.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/0f6f96a3c94cdf559211ff81.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/0f6f96a3c94cdf559211ff81.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/0f8b91792f6f95789f355417.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/0f8b91792f6f95789f355417.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/150dc8302b45a792d4747f99.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/150dc8302b45a792d4747f99.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/28fe89bb57944f81e98ed11a.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/28fe89bb57944f81e98ed11a.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/2e95471e686c3a8f79be501e.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/2e95471e686c3a8f79be501e.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/369d6dbaf8c2506bcb594f35.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/369d6dbaf8c2506bcb594f35.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/3a2da70ca32a76275ca2f68e.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/3a2da70ca32a76275ca2f68e.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/3b9dffb0878c92ca86dcad69.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/3b9dffb0878c92ca86dcad69.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/46d307ee511515271a4065ab.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/46d307ee511515271a4065ab.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/49f5dfc86ffe7e2a3742708c.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/49f5dfc86ffe7e2a3742708c.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/4a5daada45f7092ad03fba80.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/4a5daada45f7092ad03fba80.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/4a9513dc4faf2c58a23843c2.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/4a9513dc4faf2c58a23843c2.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/54b36ed6c5d1a5d1e05947d2.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/54b36ed6c5d1a5d1e05947d2.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/5d43061373941a9c5760b472.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/5d43061373941a9c5760b472.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/6c26b6b68fd6b2dfe76fc7e5.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/6c26b6b68fd6b2dfe76fc7e5.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/86123a0fae9912548c9b3f0b.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/86123a0fae9912548c9b3f0b.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/936ccf707ef974c7fd322dae.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/936ccf707ef974c7fd322dae.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/a60aa8f59f4971b0ea19fc02.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/a60aa8f59f4971b0ea19fc02.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/a780fc48dc8fd680e6e57fed.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/a780fc48dc8fd680e6e57fed.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/a8756dccb320ded3cb8d54bb.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/a8756dccb320ded3cb8d54bb.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/af16c8c513257d2b6a4a474e.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/af16c8c513257d2b6a4a474e.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/b262c751b23bce51dee582bb.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/b262c751b23bce51dee582bb.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/bae9a1daf0961cacb9e1f2e7.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/bae9a1daf0961cacb9e1f2e7.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/c47a3c9ffdce6bc6c9a1cf21.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/c47a3c9ffdce6bc6c9a1cf21.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/c4a1991228cdce0eedaceb9a.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/c4a1991228cdce0eedaceb9a.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/c9db30dbdf8be27a648cd9f9.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/c9db30dbdf8be27a648cd9f9.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/d992996403392f606a0204bc.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/d992996403392f606a0204bc.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/ed12189c36429cd09ae227ed.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/ed12189c36429cd09ae227ed.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/f094eef2d183150a5f232b66.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/f094eef2d183150a5f232b66.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/fb97e1d6640aff33130fc216.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/fb97e1d6640aff33130fc216.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/fc4a15dba7732ae4fb632ab0.bin](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/mesh-data/fc4a15dba7732ae4fb632ab0.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/base_link.STL](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/base_link.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/gripper_base.STL](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/gripper_base.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/gripper_link1.STL](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/gripper_link1.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/gripper_link2.STL](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/gripper_link2.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/link1.STL](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/link1.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/link2.STL](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/link2.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/link3.STL](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/link3.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/link4.STL](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/link4.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/link5.STL](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/meshes/link5.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/model.urdf](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/fl-v3/model.urdf) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/base_link-hardware.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/base_link-hardware.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/base_link-servo.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/base_link-servo.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/base_link-structure.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/base_link-structure.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/left_finger-finger.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/left_finger-finger.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_1-horn.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_1-horn.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_1-servo.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_1-servo.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_1-structure.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_1-structure.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_2-horn.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_2-horn.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_2-servo.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_2-servo.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_2-structure.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_2-structure.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_3-horn.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_3-horn.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_3-servo.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_3-servo.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_3-structure.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_3-structure.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_4-horn.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_4-horn.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_4-servo.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_4-servo.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_4-structure.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_4-structure.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_5-hardware.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_5-hardware.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_5-horn.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_5-horn.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_5-servo.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_5-servo.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_5-structure.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_5-structure.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_6-horn.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_6-horn.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_6-servo.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_6-servo.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_6-structure.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/link_6-structure.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/right_finger-finger.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/right_finger-finger.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/right_finger-horn.stl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/meshes/right_finger-horn.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/model.urdf](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/urdf/ld-touch/model.urdf) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/OrbitControls.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/OrbitControls.js) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/STLLoader.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/STLLoader.js) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/fflate/LICENSE.txt](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/fflate/LICENSE.txt) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/fflate/browser.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/fflate/browser.js) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/fflate/package-version.json](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/fflate/package-version.json) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/lucide-icons.svg](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/lucide-icons.svg) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/three.core.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/three.core.js) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/three.module.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/assets/vendor/three.module.js) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/index.html](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/index.html) | 对应已交付 ZIP 的原始源文件：index.html |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/local-help.html](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/local-help.html) | 对应已交付 ZIP 的原始源文件：local-help.html |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/a1z_model_data.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/a1z_model_data.js) | 对应已交付 ZIP 的原始源文件：a1z_model_data.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/app.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/app.js) | 对应已交付 ZIP 的原始源文件：app.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/b601_model_data.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/b601_model_data.js) | 对应已交付 ZIP 的原始源文件：b601_model_data.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/browser_serial_utils.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/browser_serial_utils.js) | 对应已交付 ZIP 的原始源文件：browser_serial_utils.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/command_execution.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/command_execution.js) | 对应已交付 ZIP 的原始源文件：command_execution.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/control_lifecycle.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/control_lifecycle.js) | 对应已交付 ZIP 的原始源文件：control_lifecycle.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/control_safety.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/control_safety.js) | 对应已交付 ZIP 的原始源文件：control_safety.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/delivery-ui.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/delivery-ui.js) | 对应已交付 ZIP 的原始源文件：delivery-ui.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/factory_params.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/factory_params.js) | 对应已交付 ZIP 的原始源文件：factory_params.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/factory_restore.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/factory_restore.js) | 对应已交付 ZIP 的原始源文件：factory_restore.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/fashionstar_serial.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/fashionstar_serial.js) | 对应已交付 ZIP 的原始源文件：fashionstar_serial.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/follower_target.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/follower_target.js) | 对应已交付 ZIP 的原始源文件：follower_target.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/i18n.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/i18n.js) | 对应已交付 ZIP 的原始源文件：i18n.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/ik_solver.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/ik_solver.js) | 对应已交付 ZIP 的原始源文件：ik_solver.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/interaction.css](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/interaction.css) | 对应已交付 ZIP 的原始源文件：interaction.css |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/joint_mapper.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/joint_mapper.js) | 对应已交付 ZIP 的原始源文件：joint_mapper.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/joint_slider_control.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/joint_slider_control.js) | 对应已交付 ZIP 的原始源文件：joint_slider_control.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/lumos-local.css](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/lumos-local.css) | 对应已交付 ZIP 的原始源文件：lumos-local.css |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/lumos_client.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/lumos_client.js) | 对应已交付 ZIP 的原始源文件：lumos_client.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/lumos_setup.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/lumos_setup.js) | 对应已交付 ZIP 的原始源文件：lumos_setup.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/manual_control_session.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/manual_control_session.js) | 对应已交付 ZIP 的原始源文件：manual_control_session.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/mesh_asset_cache.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/mesh_asset_cache.js) | 对应已交付 ZIP 的原始源文件：mesh_asset_cache.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/mesh_transport.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/mesh_transport.js) | 对应已交付 ZIP 的原始源文件：mesh_transport.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/mesh_transport_manifest.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/mesh_transport_manifest.js) | 对应已交付 ZIP 的原始源文件：mesh_transport_manifest.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/model_asset_loader.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/model_asset_loader.js) | 对应已交付 ZIP 的原始源文件：model_asset_loader.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/page-lifecycle.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/page-lifecycle.js) | 对应已交付 ZIP 的原始源文件：page-lifecycle.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/piper_model_data.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/piper_model_data.js) | 对应已交付 ZIP 的原始源文件：piper_model_data.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/rate_meter.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/rate_meter.js) | 对应已交付 ZIP 的原始源文件：rate_meter.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/reset_origin.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/reset_origin.js) | 对应已交付 ZIP 的原始源文件：reset_origin.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/resource_download.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/resource_download.js) | 对应已交付 ZIP 的原始源文件：resource_download.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/robot_model.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/robot_model.js) | 对应已交付 ZIP 的原始源文件：robot_model.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/robot_model_configs.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/robot_model_configs.js) | 对应已交付 ZIP 的原始源文件：robot_model_configs.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/robot_profiles.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/robot_profiles.js) | 对应已交付 ZIP 的原始源文件：robot_profiles.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/runtime_integration.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/runtime_integration.js) | 对应已交付 ZIP 的原始源文件：runtime_integration.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/serial_servo_bus.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/serial_servo_bus.js) | 对应已交付 ZIP 的原始源文件：serial_servo_bus.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/servo_readback.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/servo_readback.js) | 对应已交付 ZIP 的原始源文件：servo_readback.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/settings.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/settings.js) | 对应已交付 ZIP 的原始源文件：settings.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/styles.css](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/styles.css) | 对应已交付 ZIP 的原始源文件：styles.css |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/supplied_urdf_mapping.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/supplied_urdf_mapping.js) | 对应已交付 ZIP 的原始源文件：supplied_urdf_mapping.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/supplied_urdf_models.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/supplied_urdf_models.js) | 对应已交付 ZIP 的原始源文件：supplied_urdf_models.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/target_execution_ownership.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/target_execution_ownership.js) | 对应已交付 ZIP 的原始源文件：target_execution_ownership.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/tcp_drag_preview.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/tcp_drag_preview.js) | 对应已交付 ZIP 的原始源文件：tcp_drag_preview.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/tcp_translation_gizmo.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/tcp_translation_gizmo.js) | 对应已交付 ZIP 的原始源文件：tcp_translation_gizmo.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/teleop_controller.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/teleop_controller.js) | 对应已交付 ZIP 的原始源文件：teleop_controller.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/teleop_pairing.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/teleop_pairing.js) | 对应已交付 ZIP 的原始源文件：teleop_pairing.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/touch_button.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/touch_button.js) | 对应已交付 ZIP 的原始源文件：touch_button.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/urdf_model_data.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/urdf_model_data.js) | 对应已交付 ZIP 的原始源文件：urdf_model_data.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/version.js](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/Browser_SDK/src/version.js) | 对应已交付 ZIP 的原始源文件：version.js |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/SHA256SUMS](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/SHA256SUMS) | 对应已交付 ZIP 的原始源文件：SHA256SUMS |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/__init__.py](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/__init__.py) | 对应已交付 ZIP 的原始源文件：__init__.py |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/app.py](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/app.py) | 对应已交付 ZIP 的原始源文件：app.py |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/domain.py](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/domain.py) | 对应已交付 ZIP 的原始源文件：domain.py |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/lumos_calibration.py](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/lumos_calibration.py) | 对应已交付 ZIP 的原始源文件：lumos_calibration.py |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/lumos_runtime.py](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/lumos_runtime.py) | 对应已交付 ZIP 的原始源文件：lumos_runtime.py |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/vendor/README.txt](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/vendor/README.txt) | 对应已交付 ZIP 的原始源文件：README.txt |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/vendor/fashionstar_uart_sdk-1.3.6-py3-none-any.whl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/vendor/fashionstar_uart_sdk-1.3.6-py3-none-any.whl) | 对应已交付 ZIP 的原始源文件：fashionstar_uart_sdk-1.3.6-py3-none-any.whl |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/vendor/fashionstar_uart_sdk-1.3.6-py3-none-any.whl.LICENSE.txt](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/vendor/fashionstar_uart_sdk-1.3.6-py3-none-any.whl.LICENSE.txt) | 对应已交付 ZIP 的原始源文件：fashionstar_uart_sdk-1.3.6-py3-none-any.whl.LICENSE.txt |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/vendor/pyserial-3.5-py2.py3-none-any.whl](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/ai_service/vendor/pyserial-3.5-py2.py3-none-any.whl) | 对应已交付 ZIP 的原始源文件：pyserial-3.5-py2.py3-none-any.whl |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/configure_can.sh](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/configure_can.sh) | 对应已交付 ZIP 的原始源文件：configure_can.sh |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/package.json](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/package.json) | 对应已交付 ZIP 的原始源文件：package.json |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/start_ubuntu_lumos.sh](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/start_ubuntu_lumos.sh) | 对应已交付 ZIP 的原始源文件：start_ubuntu_lumos.sh |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/tools/__init__.py](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/tools/__init__.py) | 对应已交付 ZIP 的原始源文件：__init__.py |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/tools/start_lumos_local.py](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/tools/start_lumos_local.py) | 对应已交付 ZIP 的原始源文件：start_lumos_local.py |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/tools/ubuntu_setup.py](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/tools/ubuntu_setup.py) | 对应已交付 ZIP 的原始源文件：ubuntu_setup.py |
| [delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/使用说明.txt](../delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38/使用说明.txt) | 该交付包的使用或部署说明 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/SHA256SUMS](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/SHA256SUMS) | 对应已交付 ZIP 的原始源文件：SHA256SUMS |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/Ubuntu安装包/star-arm-act_1.0.23_fashionstar_all.deb](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/Ubuntu安装包/star-arm-act_1.0.23_fashionstar_all.deb) | 随完整服务器包提供的 Ubuntu 本机组件 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/Ubuntu安装包/star-arm-lumos_1.0.32_fashionstar_amd64.deb](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/Ubuntu安装包/star-arm-lumos_1.0.32_fashionstar_amd64.deb) | 随完整服务器包提供的 Ubuntu 本机组件 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/修复说明.txt](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/修复说明.txt) | 对应已交付 ZIP 的原始源文件：修复说明.txt |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/性能对比.json](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/性能对比.json) | 对应已交付 ZIP 的原始源文件：性能对比.json |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/act-browser.html](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/act-browser.html) | 对应已交付 ZIP 的原始源文件：act-browser.html |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/act-workbench.html](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/act-workbench.html) | 对应已交付 ZIP 的原始源文件：act-workbench.html |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/icon.png](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/icon.png) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/logo-full.png](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/logo-full.png) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/logo-icon.png](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/logo-icon.png) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/logo.svg](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/logo.svg) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/011d60e7ac091d136a2ecb98.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/011d60e7ac091d136a2ecb98.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/0d413a2d34b308d42827e8b3.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/0d413a2d34b308d42827e8b3.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/0e5a266d6513a5c31ed1df0b.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/0e5a266d6513a5c31ed1df0b.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/0f6f96a3c94cdf559211ff81.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/0f6f96a3c94cdf559211ff81.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/0f8b91792f6f95789f355417.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/0f8b91792f6f95789f355417.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/1498c42b0b86dea8d1577c18.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/1498c42b0b86dea8d1577c18.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/14d98e291f5eb20ce50886fc.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/14d98e291f5eb20ce50886fc.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/150dc8302b45a792d4747f99.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/150dc8302b45a792d4747f99.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/153e3e4b641d01a3a358f59c.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/153e3e4b641d01a3a358f59c.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/16885044f34f446f3ce7dc50.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/16885044f34f446f3ce7dc50.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/1929795251e54eac510d1191.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/1929795251e54eac510d1191.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/19ea62cabf41394d4de0ce44.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/19ea62cabf41394d4de0ce44.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/1f0597552846719e14f8ae3c.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/1f0597552846719e14f8ae3c.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/28fe89bb57944f81e98ed11a.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/28fe89bb57944f81e98ed11a.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/2e95471e686c3a8f79be501e.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/2e95471e686c3a8f79be501e.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/314a0499f6290ecc7a26e672.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/314a0499f6290ecc7a26e672.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/33fc9ebe2654cc27d47edd97.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/33fc9ebe2654cc27d47edd97.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/369d6dbaf8c2506bcb594f35.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/369d6dbaf8c2506bcb594f35.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/38735343df6f709e83edc914.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/38735343df6f709e83edc914.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/3a2da70ca32a76275ca2f68e.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/3a2da70ca32a76275ca2f68e.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/3a87d05e1afb964c8f7f6318.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/3a87d05e1afb964c8f7f6318.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/3ad75b62388108b0792028df.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/3ad75b62388108b0792028df.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/3b9dffb0878c92ca86dcad69.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/3b9dffb0878c92ca86dcad69.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/3dc33c484f02966f43c37b38.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/3dc33c484f02966f43c37b38.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/41db37ff64edfa42ec551721.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/41db37ff64edfa42ec551721.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/46d307ee511515271a4065ab.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/46d307ee511515271a4065ab.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/49f5dfc86ffe7e2a3742708c.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/49f5dfc86ffe7e2a3742708c.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/4a5daada45f7092ad03fba80.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/4a5daada45f7092ad03fba80.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/4a9513dc4faf2c58a23843c2.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/4a9513dc4faf2c58a23843c2.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/54b36ed6c5d1a5d1e05947d2.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/54b36ed6c5d1a5d1e05947d2.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/5908fbb54b3a400bb983ed7e.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/5908fbb54b3a400bb983ed7e.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/5d297c1ee35603e618b45179.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/5d297c1ee35603e618b45179.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/5d43061373941a9c5760b472.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/5d43061373941a9c5760b472.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/5e6d36082999a25c352d4d82.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/5e6d36082999a25c352d4d82.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/615b119c0bb97a032badd588.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/615b119c0bb97a032badd588.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/6315a8ae1c03a2806f9e3ade.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/6315a8ae1c03a2806f9e3ade.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/6b91d251eb5b96f0ba9b8a1f.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/6b91d251eb5b96f0ba9b8a1f.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/6c26b6b68fd6b2dfe76fc7e5.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/6c26b6b68fd6b2dfe76fc7e5.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/737afd2cc87651ed3a2e7a56.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/737afd2cc87651ed3a2e7a56.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/783383016dbe0a258bd94e7f.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/783383016dbe0a258bd94e7f.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/7aa96b31802154e931f0182d.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/7aa96b31802154e931f0182d.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/7ae5bb8843726cab85befab7.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/7ae5bb8843726cab85befab7.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/7c696afbc51a0e35d9f84701.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/7c696afbc51a0e35d9f84701.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/86123a0fae9912548c9b3f0b.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/86123a0fae9912548c9b3f0b.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/89c8d6d4facb21a00e8c9568.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/89c8d6d4facb21a00e8c9568.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/8a92b987c41998e9edca22d9.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/8a92b987c41998e9edca22d9.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/936ccf707ef974c7fd322dae.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/936ccf707ef974c7fd322dae.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/95364d6a7008b62fe173f447.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/95364d6a7008b62fe173f447.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/9662aae35b537db3b1f818e9.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/9662aae35b537db3b1f818e9.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/99b7c0c7993fada7a710ec4c.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/99b7c0c7993fada7a710ec4c.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/a007ba1c0b0f9cb7da617b21.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/a007ba1c0b0f9cb7da617b21.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/a29384cf225b638d37191443.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/a29384cf225b638d37191443.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/a60aa8f59f4971b0ea19fc02.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/a60aa8f59f4971b0ea19fc02.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/a723d1cdaf2b37fbd54135d5.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/a723d1cdaf2b37fbd54135d5.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/a780fc48dc8fd680e6e57fed.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/a780fc48dc8fd680e6e57fed.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/a826e164d420a6922e8ad5ee.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/a826e164d420a6922e8ad5ee.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/a8756dccb320ded3cb8d54bb.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/a8756dccb320ded3cb8d54bb.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/af16c8c513257d2b6a4a474e.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/af16c8c513257d2b6a4a474e.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/b262c751b23bce51dee582bb.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/b262c751b23bce51dee582bb.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/bae9a1daf0961cacb9e1f2e7.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/bae9a1daf0961cacb9e1f2e7.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/c47a3c9ffdce6bc6c9a1cf21.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/c47a3c9ffdce6bc6c9a1cf21.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/c4a1991228cdce0eedaceb9a.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/c4a1991228cdce0eedaceb9a.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/c4e0de70f776b3573d975a6e.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/c4e0de70f776b3573d975a6e.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/c586a7d0b8345d2cd32eab7d.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/c586a7d0b8345d2cd32eab7d.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/c9db30dbdf8be27a648cd9f9.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/c9db30dbdf8be27a648cd9f9.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/d456136c7041d4f7f0773394.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/d456136c7041d4f7f0773394.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/d992996403392f606a0204bc.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/d992996403392f606a0204bc.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/da8d3bd051d39ba13b25636f.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/da8d3bd051d39ba13b25636f.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/de6bd12937e6464399589aa1.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/de6bd12937e6464399589aa1.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/e0fa3550a433a40755c4a8c8.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/e0fa3550a433a40755c4a8c8.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/e169edfc6174d761048f20e6.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/e169edfc6174d761048f20e6.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/e264dd2a1972ba91828c0e11.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/e264dd2a1972ba91828c0e11.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/e2ffe5fd1fdd8a68324f9b96.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/e2ffe5fd1fdd8a68324f9b96.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/e3a17a84782a49483710ca95.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/e3a17a84782a49483710ca95.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/e8a1bcadd6ab0e38dc9aee9c.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/e8a1bcadd6ab0e38dc9aee9c.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/ecebb8bb5f7277558c1438f5.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/ecebb8bb5f7277558c1438f5.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/ed12189c36429cd09ae227ed.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/ed12189c36429cd09ae227ed.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/f094eef2d183150a5f232b66.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/f094eef2d183150a5f232b66.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/f0bfdd48fc91b37f3156b290.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/f0bfdd48fc91b37f3156b290.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/f2ccbbe8089679c3ddcdcf44.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/f2ccbbe8089679c3ddcdcf44.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/f654297bb71c6985c61e4910.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/f654297bb71c6985c61e4910.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/f98aececf6324771940be38f.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/f98aececf6324771940be38f.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/f9a97922bc6bf86ac513e8a2.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/f9a97922bc6bf86ac513e8a2.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/fb97e1d6640aff33130fc216.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/fb97e1d6640aff33130fc216.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/fc4a15dba7732ae4fb632ab0.bin](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/mesh-data/fc4a15dba7732ae4fb632ab0.bin) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/arm_link1.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/arm_link1.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/arm_link2.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/arm_link2.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/arm_link3.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/arm_link3.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/arm_link4.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/arm_link4.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/arm_link5.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/arm_link5.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/arm_link6.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/arm_link6.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/base_link.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/base_link.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/gripper_finger_left_link.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/gripper_finger_left_link.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/gripper_finger_right_link.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z-gripper/gripper_finger_right_link.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/arm_link1.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/arm_link1.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/arm_link2.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/arm_link2.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/arm_link3.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/arm_link3.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/arm_link4.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/arm_link4.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/arm_link5.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/arm_link5.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/arm_link6.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/arm_link6.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/base_link.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/base_link.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/gripper_finger_left_link.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/gripper_finger_left_link.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/gripper_finger_right_link.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/a1z/gripper_finger_right_link.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601-gripper/gripper_left.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601-gripper/gripper_left.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601-gripper/gripper_link.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601-gripper/gripper_link.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601-gripper/gripper_right.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601-gripper/gripper_right.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601-gripper/link6.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601-gripper/link6.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/base_link.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/base_link.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/end_link.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/end_link.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/link1.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/link1.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/link2.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/link2.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/link3.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/link3.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/link4.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/link4.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/link5.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/link5.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/link6.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/b601/link6.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/base_link.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/base_link.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link1.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link1.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link2.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link2.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link3.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link3.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link4.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link4.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link5.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link5.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link6.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link6.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link7_left.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link7_left.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link7_right.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/fl/link7_right.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/base_link.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/base_link.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link1.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link1.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link2.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link2.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link3.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link3.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link4.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link4.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link5.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link5.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link6.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link6.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link7_left.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link7_left.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link7_right.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/ld/link7_right.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/base_link.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/base_link.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link1.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link1.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link2.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link2.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link3.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link3.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link4.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link4.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link6.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link6.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link7_left.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link7_left.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link7_right.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link7_right.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link_5.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/models/piper/link_5.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/resource-manifest.json](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/resource-manifest.json) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/a1z/A1Z_G1Z_with_gripper.urdf](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/a1z/A1Z_G1Z_with_gripper.urdf) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/a1z/model.urdf](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/a1z/model.urdf) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/b601/reBot-DevArm_fixend.csv](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/b601/reBot-DevArm_fixend.csv) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/b601/reBot-DevArm_fixend.urdf](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/b601/reBot-DevArm_fixend.urdf) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/b601/reBot_B601_DM_with_gripper.urdf](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/b601/reBot_B601_DM_with_gripper.urdf) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/base_link.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/base_link.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/gripper_base.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/gripper_base.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/gripper_link1.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/gripper_link1.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/gripper_link2.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/gripper_link2.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/link1.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/link1.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/link2.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/link2.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/link3.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/link3.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/link4.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/link4.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/link5.STL](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/meshes/link5.STL) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/model.urdf](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/model.urdf) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/source.urdf](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/fl-v3/source.urdf) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/SOURCE.json](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/SOURCE.json) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/kinematics.json](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/kinematics.json) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/base_link-hardware.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/base_link-hardware.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/base_link-servo.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/base_link-servo.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/base_link-structure.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/base_link-structure.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/left_finger-finger.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/left_finger-finger.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_1-horn.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_1-horn.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_1-servo.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_1-servo.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_1-structure.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_1-structure.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_2-horn.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_2-horn.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_2-servo.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_2-servo.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_2-structure.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_2-structure.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_3-horn.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_3-horn.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_3-servo.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_3-servo.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_3-structure.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_3-structure.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_4-horn.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_4-horn.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_4-servo.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_4-servo.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_4-structure.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_4-structure.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_5-hardware.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_5-hardware.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_5-horn.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_5-horn.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_5-servo.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_5-servo.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_5-structure.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_5-structure.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_6-horn.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_6-horn.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_6-servo.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_6-servo.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_6-structure.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/link_6-structure.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/right_finger-finger.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/right_finger-finger.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/right_finger-horn.stl](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/meshes/right_finger-horn.stl) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/model.urdf](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/model.urdf) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/source.urdf](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/source.urdf) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/upstream-README.md](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld-touch/upstream-README.md) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld/model.urdf](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/ld/model.urdf) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/piper/export_report.json](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/piper/export_report.json) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/piper/model.urdf](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/piper/model.urdf) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/piper/parts.json](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/urdf/piper/parts.json) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/OrbitControls.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/OrbitControls.js) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/STLLoader.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/STLLoader.js) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/fflate/LICENSE.txt](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/fflate/LICENSE.txt) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/fflate/browser.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/fflate/browser.js) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/fflate/package-version.json](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/fflate/package-version.json) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/lucide-LICENSE.txt](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/lucide-LICENSE.txt) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/lucide-icons.svg](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/lucide-icons.svg) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/onnxruntime-web/LICENSE.txt](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/onnxruntime-web/LICENSE.txt) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.js) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/onnxruntime-web/ort.webgpu.min.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/onnxruntime-web/ort.webgpu.min.js) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/onnxruntime-web/package-version.json](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/onnxruntime-web/package-version.json) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/three.core.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/three.core.js) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/three.module.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/assets/vendor/three.module.js) | 完整交付所需的模型、压缩网格、前端库与许可资源 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/downloads/act-runtime-template.deb](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/downloads/act-runtime-template.deb) | 随完整服务器包提供的 Ubuntu 本机组件 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/downloads/lumos-runtime-template.deb](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/downloads/lumos-runtime-template.deb) | 随完整服务器包提供的 Ubuntu 本机组件 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/downloads/star-arm-act_1.0.23_fashionstar_all.deb](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/downloads/star-arm-act_1.0.23_fashionstar_all.deb) | 随完整服务器包提供的 Ubuntu 本机组件 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/downloads/star-arm-lumos_1.0.32_fashionstar_amd64.deb](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/downloads/star-arm-lumos_1.0.32_fashionstar_amd64.deb) | 随完整服务器包提供的 Ubuntu 本机组件 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/index.html](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/index.html) | 对应已交付 ZIP 的原始源文件：index.html |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/a1z_model_data.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/a1z_model_data.js) | 对应已交付 ZIP 的原始源文件：a1z_model_data.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-browser-app.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-browser-app.js) | 对应已交付 ZIP 的原始源文件：act-browser-app.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-browser-core.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-browser-core.js) | 对应已交付 ZIP 的原始源文件：act-browser-core.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-browser-runtime.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-browser-runtime.js) | 对应已交付 ZIP 的原始源文件：act-browser-runtime.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-browser-worker.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-browser-worker.js) | 对应已交付 ZIP 的原始源文件：act-browser-worker.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-browser.css](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-browser.css) | 对应已交付 ZIP 的原始源文件：act-browser.css |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-camera-frame-encoder-worker-client.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-camera-frame-encoder-worker-client.js) | 对应已交付 ZIP 的原始源文件：act-camera-frame-encoder-worker-client.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-camera-frame-encoder-worker.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-camera-frame-encoder-worker.js) | 对应已交付 ZIP 的原始源文件：act-camera-frame-encoder-worker.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-camera-frame-uploader.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-camera-frame-uploader.js) | 对应已交付 ZIP 的原始源文件：act-camera-frame-uploader.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-camera-state.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-camera-state.js) | 对应已交付 ZIP 的原始源文件：act-camera-state.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-cameras.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-cameras.js) | 对应已交付 ZIP 的原始源文件：act-cameras.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-capture-quality.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-capture-quality.js) | 对应已交付 ZIP 的原始源文件：act-capture-quality.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-inference.css](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-inference.css) | 对应已交付 ZIP 的原始源文件：act-inference.css |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-installer.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-installer.js) | 对应已交付 ZIP 的原始源文件：act-installer.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-motion.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-motion.js) | 对应已交付 ZIP 的原始源文件：act-motion.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-ui-refresh.css](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-ui-refresh.css) | 对应已交付 ZIP 的原始源文件：act-ui-refresh.css |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-waveform.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-waveform.js) | 对应已交付 ZIP 的原始源文件：act-waveform.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-workbench.css](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-workbench.css) | 对应已交付 ZIP 的原始源文件：act-workbench.css |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-workbench.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/act-workbench.js) | 对应已交付 ZIP 的原始源文件：act-workbench.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/api-client.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/api-client.js) | 对应已交付 ZIP 的原始源文件：api-client.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/app.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/app.js) | 对应已交付 ZIP 的原始源文件：app.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/b601_model_data.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/b601_model_data.js) | 对应已交付 ZIP 的原始源文件：b601_model_data.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/browser_serial_utils.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/browser_serial_utils.js) | 对应已交付 ZIP 的原始源文件：browser_serial_utils.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/command_execution.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/command_execution.js) | 对应已交付 ZIP 的原始源文件：command_execution.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/control_lifecycle.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/control_lifecycle.js) | 对应已交付 ZIP 的原始源文件：control_lifecycle.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/control_safety.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/control_safety.js) | 对应已交付 ZIP 的原始源文件：control_safety.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/factory_params.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/factory_params.js) | 对应已交付 ZIP 的原始源文件：factory_params.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/factory_restore.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/factory_restore.js) | 对应已交付 ZIP 的原始源文件：factory_restore.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/fashionstar_serial.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/fashionstar_serial.js) | 对应已交付 ZIP 的原始源文件：fashionstar_serial.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/fl_trajectory_controller.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/fl_trajectory_controller.js) | 对应已交付 ZIP 的原始源文件：fl_trajectory_controller.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/fl_trajectory_model.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/fl_trajectory_model.js) | 对应已交付 ZIP 的原始源文件：fl_trajectory_model.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/fl_trajectory_preview.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/fl_trajectory_preview.js) | 对应已交付 ZIP 的原始源文件：fl_trajectory_preview.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/fl_trajectory_store.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/fl_trajectory_store.js) | 对应已交付 ZIP 的原始源文件：fl_trajectory_store.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/fl_trajectory_styles.css](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/fl_trajectory_styles.css) | 对应已交付 ZIP 的原始源文件：fl_trajectory_styles.css |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/fl_trajectory_workspace.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/fl_trajectory_workspace.js) | 对应已交付 ZIP 的原始源文件：fl_trajectory_workspace.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/follower_target.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/follower_target.js) | 对应已交付 ZIP 的原始源文件：follower_target.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/i18n.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/i18n.js) | 对应已交付 ZIP 的原始源文件：i18n.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/ik_solver.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/ik_solver.js) | 对应已交付 ZIP 的原始源文件：ik_solver.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/interaction.css](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/interaction.css) | 对应已交付 ZIP 的原始源文件：interaction.css |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/joint_mapper.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/joint_mapper.js) | 对应已交付 ZIP 的原始源文件：joint_mapper.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/joint_slider_control.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/joint_slider_control.js) | 对应已交付 ZIP 的原始源文件：joint_slider_control.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/local-service.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/local-service.js) | 对应已交付 ZIP 的原始源文件：local-service.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/lumos_client.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/lumos_client.js) | 对应已交付 ZIP 的原始源文件：lumos_client.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/lumos_setup.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/lumos_setup.js) | 对应已交付 ZIP 的原始源文件：lumos_setup.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/manual_control_session.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/manual_control_session.js) | 对应已交付 ZIP 的原始源文件：manual_control_session.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/mesh_asset_cache.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/mesh_asset_cache.js) | 对应已交付 ZIP 的原始源文件：mesh_asset_cache.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/mesh_transport.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/mesh_transport.js) | 对应已交付 ZIP 的原始源文件：mesh_transport.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/mesh_transport_manifest.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/mesh_transport_manifest.js) | 对应已交付 ZIP 的原始源文件：mesh_transport_manifest.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/model_asset_loader.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/model_asset_loader.js) | 对应已交付 ZIP 的原始源文件：model_asset_loader.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/page-lifecycle.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/page-lifecycle.js) | 对应已交付 ZIP 的原始源文件：page-lifecycle.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/piper_model_data.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/piper_model_data.js) | 对应已交付 ZIP 的原始源文件：piper_model_data.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/published_installers.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/published_installers.js) | 对应已交付 ZIP 的原始源文件：published_installers.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/rate_meter.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/rate_meter.js) | 对应已交付 ZIP 的原始源文件：rate_meter.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/reset_origin.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/reset_origin.js) | 对应已交付 ZIP 的原始源文件：reset_origin.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/resource_download.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/resource_download.js) | 对应已交付 ZIP 的原始源文件：resource_download.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/robot_model.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/robot_model.js) | 对应已交付 ZIP 的原始源文件：robot_model.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/robot_model_configs.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/robot_model_configs.js) | 对应已交付 ZIP 的原始源文件：robot_model_configs.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/robot_profiles.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/robot_profiles.js) | 对应已交付 ZIP 的原始源文件：robot_profiles.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/runtime_integration.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/runtime_integration.js) | 对应已交付 ZIP 的原始源文件：runtime_integration.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/serial_servo_bus.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/serial_servo_bus.js) | 对应已交付 ZIP 的原始源文件：serial_servo_bus.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_bus_wizard.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_bus_wizard.js) | 对应已交付 ZIP 的原始源文件：servo_bus_wizard.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_readback.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_readback.js) | 对应已交付 ZIP 的原始源文件：servo_readback.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_setup.css](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_setup.css) | 对应已交付 ZIP 的原始源文件：servo_setup.css |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_setup.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_setup.js) | 对应已交付 ZIP 的原始源文件：servo_setup.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_setup_flow.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_setup_flow.js) | 对应已交付 ZIP 的原始源文件：servo_setup_flow.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_setup_i18n.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_setup_i18n.js) | 对应已交付 ZIP 的原始源文件：servo_setup_i18n.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_setup_model.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_setup_model.js) | 对应已交付 ZIP 的原始源文件：servo_setup_model.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_setup_parts.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/servo_setup_parts.js) | 对应已交付 ZIP 的原始源文件：servo_setup_parts.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/settings.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/settings.js) | 对应已交付 ZIP 的原始源文件：settings.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/styles.css](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/styles.css) | 对应已交付 ZIP 的原始源文件：styles.css |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/supplied_urdf_mapping.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/supplied_urdf_mapping.js) | 对应已交付 ZIP 的原始源文件：supplied_urdf_mapping.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/supplied_urdf_models.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/supplied_urdf_models.js) | 对应已交付 ZIP 的原始源文件：supplied_urdf_models.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/target_execution_ownership.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/target_execution_ownership.js) | 对应已交付 ZIP 的原始源文件：target_execution_ownership.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/tcp_drag_preview.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/tcp_drag_preview.js) | 对应已交付 ZIP 的原始源文件：tcp_drag_preview.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/tcp_translation_gizmo.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/tcp_translation_gizmo.js) | 对应已交付 ZIP 的原始源文件：tcp_translation_gizmo.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/teleop_controller.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/teleop_controller.js) | 对应已交付 ZIP 的原始源文件：teleop_controller.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/teleop_pairing.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/teleop_pairing.js) | 对应已交付 ZIP 的原始源文件：teleop_pairing.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/touch_button.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/touch_button.js) | 对应已交付 ZIP 的原始源文件：touch_button.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/training-submission.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/training-submission.js) | 对应已交付 ZIP 的原始源文件：training-submission.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/urdf-preview.css](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/urdf-preview.css) | 对应已交付 ZIP 的原始源文件：urdf-preview.css |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/urdf-preview.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/urdf-preview.js) | 对应已交付 ZIP 的原始源文件：urdf-preview.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/urdf_model_data.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/urdf_model_data.js) | 对应已交付 ZIP 的原始源文件：urdf_model_data.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/version.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/version.js) | 对应已交付 ZIP 的原始源文件：version.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/workspace-nav.css](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/workspace-nav.css) | 对应已交付 ZIP 的原始源文件：workspace-nav.css |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/workspace-nav.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/workspace-nav.js) | 对应已交付 ZIP 的原始源文件：workspace-nav.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/workspace-switch.css](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/workspace-switch.css) | 对应已交付 ZIP 的原始源文件：workspace-switch.css |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/workspace-switch.js](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/src/workspace-switch.js) | 对应已交付 ZIP 的原始源文件：workspace-switch.js |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/urdf-preview.html](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/服务器网页/urdf-preview.html) | 对应已交付 ZIP 的原始源文件：urdf-preview.html |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/部署说明.md](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/部署说明.md) | 该交付包的使用或部署说明 |
| [delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/验证记录.txt](../delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/验证记录.txt) | 对应已交付 ZIP 的原始源文件：验证记录.txt |
| [delivery/manifest.json](../delivery/manifest.json) | 最新交付版本、原 ZIP 信息与每个源文件的 SHA256 |
| [docs/ACT_GUIDE.md](../docs/ACT_GUIDE.md) | 采集、校准、训练、完整模型导入与执行教程 |
| [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) | 服务器、浏览器、本机后台与虚拟环境职责说明 |
| [docs/BROWSER_EXECUTION.md](../docs/BROWSER_EXECUTION.md) | Windows 纯网页客户执行与提供方一键导出模型图文教程 |
| [docs/CONSOLE_GUIDE.md](../docs/CONSOLE_GUIDE.md) | 控制台连接、三维查看、控制和舵机设置图文教程 |
| [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) | 服务器只上传静态文件的发布教程 |
| [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md) | 开发检查、打包、更新与持续集成教程 |
| [docs/FILE_MAP.md](../docs/FILE_MAP.md) | 本清单：每个仓库文件的用途 |
| [docs/GETTING_STARTED.md](../docs/GETTING_STARTED.md) | 图文快速上手、下载选择与已有模型 / 自训练路线 |
| [docs/LUMOS_TELEOP.md](../docs/LUMOS_TELEOP.md) | Ubuntu CAN 连接、网页校准、预览、遥操作与测试边界 |
| [docs/TROUBLESHOOTING.md](../docs/TROUBLESHOOTING.md) | 启动、环境、设备、相机与导入问题排查 |
| [docs/UBUNTU.md](../docs/UBUNTU.md) | Ubuntu 首次安装、本地启动、环境与数据目录教程 |
| [docs/URDF_MODELS.md](../docs/URDF_MODELS.md) | 新增 FL 和 LD 模型预览入口、来源和坐标说明 |
| [docs/WINDOWS.md](../docs/WINDOWS.md) | Windows 启动与功能支持范围教程 |
| [docs/images/act-calibration-dialog.png](../docs/images/act-calibration-dialog.png) | 真实界面教程截图（硬件未连接）：从臂校准窗口 |
| [docs/images/act-collect-overview.png](../docs/images/act-collect-overview.png) | 真实界面教程截图（硬件未连接）：ACT 数据采集全景 |
| [docs/images/act-collection-entry.png](../docs/images/act-collection-entry.png) | 真实界面教程截图（硬件未连接）：第 1 步采集连接与大画面入口（隔离服务、硬件未连接） |
| [docs/images/act-dataset-form.png](../docs/images/act-dataset-form.png) | 真实界面教程截图（硬件未连接）：数据集创建表单与未提交示例 |
| [docs/images/act-device-panel.png](../docs/images/act-device-panel.png) | 真实界面教程截图（硬件未连接）：ACT 设备连接面板 |
| [docs/images/act-execution-connections.png](../docs/images/act-execution-connections.png) | 真实界面教程截图（硬件未连接）：第 4 步从臂连接与校验门槛 |
| [docs/images/act-execution-overview.png](../docs/images/act-execution-overview.png) | 真实界面教程截图（硬件未连接）：ACT 实机推理全景 |
| [docs/images/act-first-setup.png](../docs/images/act-first-setup.png) | 真实界面教程截图（硬件未连接）：Ubuntu 首次安装与环境配置入口 |
| [docs/images/act-inference-large-preview.png](../docs/images/act-inference-large-preview.png) | 真实界面教程截图（硬件未连接）：第 4 步双相机大预览与同屏曲线（硬件未连接） |
| [docs/images/act-model-import.png](../docs/images/act-model-import.png) | 真实界面教程截图（硬件未连接）：模型管理与导入入口 |
| [docs/images/console-device-panel.png](../docs/images/console-device-panel.png) | 真实界面教程截图（硬件未连接）：控制台设备连接面板 |
| [docs/images/console-overview.png](../docs/images/console-overview.png) | 真实界面教程截图（硬件未连接）：控制台全景 |
| [docs/images/console-servo-setup.png](../docs/images/console-servo-setup.png) | 真实界面教程截图（硬件未连接）：控制台舵机设置页面 |
| [docs/images/ubuntu-install-recovery.png](../docs/images/ubuntu-install-recovery.png) | 真实界面教程截图（硬件未连接）：Ubuntu 安装故障帮助与重新检测入口（组件未连接） |
| [docs/images/windows-browser-execution.png](../docs/images/windows-browser-execution.png) | 真实界面教程截图（硬件未连接）：Windows 纯网页执行全景，未连接硬件 |
| [docs/images/windows-runtime-ready.png](../docs/images/windows-runtime-ready.png) | 真实界面教程截图（硬件未连接）：Windows 实际 CPU 执行环境自检就绪界面（未连接硬件） |
| [docs/images/windows-website-connection.png](../docs/images/windows-website-connection.png) | 真实界面教程截图（硬件未连接）：Windows 当前网站本机连接确认页（本机测试地址） |
| [docs/images/workspace-transition.png](../docs/images/workspace-transition.png) | 真实界面教程截图（硬件未连接）：全屏工作区切换动画 |
| [package-lock.json](../package-lock.json) | 固定 Node 开发依赖解析版本 |
| [package.json](../package.json) | ES module 配置、前端测试命令和 Playwright 开发依赖 |
| [runtime/Browser_SDK/index.html](../runtime/Browser_SDK/index.html) | 安装组件自带的最小状态页面，完整界面在网站 |
| [runtime/start_desktop_sessions.py](../runtime/start_desktop_sessions.py) | 安装后识别活动桌面用户并启动用户后台 |
| [runtime/ubuntu_runtime.py](../runtime/ubuntu_runtime.py) | 用户后台启动、网站授权、环回 API 与组件连接检测 |
| [start_ubuntu.sh](../start_ubuntu.sh) | Ubuntu 检查并补齐系统依赖，使用系统 Python 启动网页与后台 |
| [start_ubuntu_lumos.sh](../start_ubuntu_lumos.sh) | 使用系统 Python 准备隔离 Lumos SDK 环境并打开 Ubuntu 本机控制台 |
| [start_ubuntu_training_test.sh](../start_ubuntu_training_test.sh) | Ubuntu 本地训练测试入口，拒绝复用旧版或仅有 API 的组件后台 |
| [start_windows.bat](../start_windows.bat) | Windows 自动选择 Python 启动同一网页与后台 |
| [start_windows_browser.bat](../start_windows_browser.bat) | Windows 双击启动本地纯网页测试，不安装 Python 或设备后台 |
| [start_windows_urdf.bat](../start_windows_urdf.bat) | Windows 双击打开控制台，测试 Touch R1 Leader 与 LumosTouch 虚拟从臂 |
| [tests/act_browser_core.test.js](../tests/act_browser_core.test.js) | 软件测试：网页模型合同、原版校准坐标转换、限位与时间索引动作调度 |
| [tests/act_browser_runtime.test.js](../tests/act_browser_runtime.test.js) | 软件测试：浏览器 Worker 推理与串口控制、实时反馈、停止和资源释放 |
| [tests/act_camera_frame_encoder_worker_client.test.js](../tests/act_camera_frame_encoder_worker_client.test.js) | 软件测试：管理相机编码 Worker 请求、超时与退出 |
| [tests/act_camera_frame_uploader.test.js](../tests/act_camera_frame_uploader.test.js) | 软件测试：管理双相机帧上传队列、批次与结束排空 |
| [tests/act_camera_state.test.js](../tests/act_camera_state.test.js) | 软件测试：统一相机连接、采集和丢帧状态 |
| [tests/act_cameras.test.js](../tests/act_cameras.test.js) | 软件测试：ACT 相机设备选择、角色绑定与预览 |
| [tests/act_capture_quality.test.js](../tests/act_capture_quality.test.js) | 软件测试：采集同步质量和帧率统计 |
| [tests/act_waveform.test.js](../tests/act_waveform.test.js) | 软件测试：Action / State 多通道曲线、时间轴与绘制 |
| [tests/act_workbench_contract.test.js](../tests/act_workbench_contract.test.js) | 软件测试：ACT 页面结构与流程约束 |
| [tests/act_workflow_smoke.cjs](../tests/act_workflow_smoke.cjs) | Windows 四步骤默认入口、第 1 步服务配置、无训练依赖采集与多分辨率预览布局 |
| [tests/api_client.test.js](../tests/api_client.test.js) | 软件测试：请求及响应体超时、取消与禁止自动重试 |
| [tests/browser_direct_smoke.cjs](../tests/browser_direct_smoke.cjs) | 无本机 API 的网页模型、相机、串口和停止流程；模拟硬件 |
| [tests/browser_smoke.cjs](../tests/browser_smoke.cjs) | 自动浏览器验证、临时本机服务与安装包生成检查 |
| [tests/camera_navigation_smoke.cjs](../tests/camera_navigation_smoke.cjs) | 隔离端口与模拟双相机，验证步骤切换复用预览和过期状态处理 |
| [tests/console_serial_smoke.cjs](../tests/console_serial_smoke.cjs) | 模拟控制台 LD/HD/FL 串口、首轮反馈、共享超时、补读与重新连接 |
| [tests/follower_calibration_ui.test.js](../tests/follower_calibration_ui.test.js) | 软件测试：从臂校准与重试界面 |
| [tests/helpers/servo_setup_hardware.cjs](../tests/helpers/servo_setup_hardware.cjs) | 软件测试：可追加舵机、切速、读写公共参数及丢包的模拟 Web Serial |
| [tests/lumos_browser_smoke.cjs](../tests/lumos_browser_smoke.cjs) | 软件测试：浏览器 Touch R1 与模拟 Lumos CAN 连接、校准、跟随和释放 |
| [tests/lumos_client.test.js](../tests/lumos_client.test.js) | 软件测试：本机 Lumos CAN 会话、六轴与夹爪新鲜采样、网页校准与停止 |
| [tests/model_import_ui.test.js](../tests/model_import_ui.test.js) | 软件测试：完整模型导入界面 |
| [tests/new_ui_i18n.test.js](../tests/new_ui_i18n.test.js) | 软件测试：新增工作区和 Lumos 面板中英文、动态错误、变量保留与日志保护 |
| [tests/page_lifecycle.test.js](../tests/page_lifecycle.test.js) | 软件测试：停止和释放成功后切页、失败保留原页与重复点击合并 |
| [tests/piper/factory_params.test.js](../tests/piper/factory_params.test.js) | 软件测试：舵机工厂参数定义、解析与验证 |
| [tests/piper/fl_trajectory_controller.test.js](../tests/piper/fl_trajectory_controller.test.js) | 软件测试：从臂轨迹播放、暂停、停止和指令调度 |
| [tests/piper/fl_trajectory_model.test.js](../tests/piper/fl_trajectory_model.test.js) | 软件测试：从臂轨迹结构、插值与关节模型 |
| [tests/piper/fl_trajectory_preview.test.js](../tests/piper/fl_trajectory_preview.test.js) | 软件测试：从臂轨迹的 3D 预览 |
| [tests/piper/fl_trajectory_store.test.js](../tests/piper/fl_trajectory_store.test.js) | 软件测试：从臂轨迹持久化、导入与导出 |
| [tests/piper/fl_trajectory_ui_contract.test.js](../tests/piper/fl_trajectory_ui_contract.test.js) | 软件测试：轨迹编辑界面约束 |
| [tests/piper/piper_ground_pose.test.js](../tests/piper/piper_ground_pose.test.js) | 软件测试：PiPER 贴地显示姿态 |
| [tests/piper/piper_joint_direction.test.js](../tests/piper/piper_joint_direction.test.js) | 软件测试：PiPER 关节方向 |
| [tests/piper/piper_leader_contract.test.js](../tests/piper/piper_leader_contract.test.js) | 软件测试：PiPER Mate 姿态源配置与显示约束 |
| [tests/piper/piper_readback_zero.test.js](../tests/piper/piper_readback_zero.test.js) | 软件测试：PiPER 实时角度、J3 多圈与夹爪中心线 |
| [tests/piper/release_version_contract.test.js](../tests/piper/release_version_contract.test.js) | 软件测试：两系统启动脚本与整合服务入口 |
| [tests/piper/servo_bus_wizard.test.js](../tests/piper/servo_bus_wizard.test.js) | 软件测试：一次启动自动检测七颗新舵机、编号、恢复 ID 0、统一速率与暂停接续 |
| [tests/piper/servo_setup_flow.test.js](../tests/piper/servo_setup_flow.test.js) | 软件测试：舵机 ID 和波特率冲突探测、保留保护参数的写入核验与只读恢复 |
| [tests/piper/servo_setup_parts.test.js](../tests/piper/servo_setup_parts.test.js) | 软件测试：从原始 LD CAD 生成的独立舵机机壳中心与精确三角面点选分组 |
| [tests/piper/servo_setup_ui_contract.test.js](../tests/piper/servo_setup_ui_contract.test.js) | 软件测试：舵机设置界面与读写错误显示 |
| [tests/servo_readback.test.js](../tests/servo_readback.test.js) | 软件测试：控制台按 ID 收集回包、每轮统一超时、仅补读缺失关节与清理等待 |
| [tests/servo_setup_browser_smoke.cjs](../tests/servo_setup_browser_smoke.cjs) | 软件测试：模拟七颗总线舵机、三维点选、单颗改参、冲突、中断恢复和中英文布局 |
| [tests/supplied_urdf_models.test.js](../tests/supplied_urdf_models.test.js) | 软件测试：新增 URDF 连接树、网格、夹爪与原控制映射隔离 |
| [tests/teleop_pairing.test.js](../tests/teleop_pairing.test.js) | 软件测试：已连接主从型号配对策略，实体 LumosTouch 仅允许 Touch R1 |
| [tests/test_act_policy_worker.py](../tests/test_act_policy_worker.py) | 软件测试：独立进程加载 ACT 策略并产生预测动作 |
| [tests/test_action_schedule.py](../tests/test_action_schedule.py) | 软件测试：动作块队列、节拍调度与多次预测融合 |
| [tests/test_api.py](../tests/test_api.py) | 软件测试：HTTP API、数据集与轮次流程 |
| [tests/test_browser_exports.py](../tests/test_browser_exports.py) | 软件测试：训练端异步网页模型导出、依赖准备、状态与下载 |
| [tests/test_browser_local.py](../tests/test_browser_local.py) | 软件测试：本地静态启动、模块与 WASM 类型、并发及请求边界 |
| [tests/test_capabilities.py](../tests/test_capabilities.py) | 软件测试：检测 Python、训练依赖、GPU 与运行阻碍 |
| [tests/test_devices.py](../tests/test_devices.py) | 软件测试：设备枚举与稳定标识、角色绑定 |
| [tests/test_domain.py](../tests/test_domain.py) | 软件测试：数据集、轮次、设备绑定与业务错误规则 |
| [tests/test_episode_data.py](../tests/test_episode_data.py) | 软件测试：示教轮次、JPEG、索引、完整性及导入导出 |
| [tests/test_fashionstar_protocol.py](../tests/test_fashionstar_protocol.py) | 软件测试：FashionStar 原始协议打包、校验与反馈解析 |
| [tests/test_follower_calibration.py](../tests/test_follower_calibration.py) | 软件测试：从臂校准记录、范围、JSON 与归一化转换 |
| [tests/test_inference_runtime.py](../tests/test_inference_runtime.py) | 软件测试：策略进程、状态读取、动作调度与推理诊断 |
| [tests/test_lerobot_convert.py](../tests/test_lerobot_convert.py) | 软件测试：将示教角度、相机和统计量转换到 LeRobot 数据约定 |
| [tests/test_lumos_api.py](../tests/test_lumos_api.py) | 软件测试：Lumos 本机同源 API、会话字段、错误传播与跨站拒绝 |
| [tests/test_lumos_local.py](../tests/test_lumos_local.py) | 软件测试：Lumos 独立启动器、SDK 固定版本及服务复用 |
| [tests/test_lumos_runtime.py](../tests/test_lumos_runtime.py) | 软件测试：Ubuntu Lumos SDK 六轴与夹爪控制、当次校准、配对与失联看门狗 |
| [tests/test_model_import.py](../tests/test_model_import.py) | 软件测试：完整模型包验证、发行包识别与导入整理 |
| [tests/test_native_act_driver.py](../tests/test_native_act_driver.py) | 软件测试：原生 FashionStar SDK 适配与从臂读写、校准坐标转换 |
| [tests/test_native_camera_api.py](../tests/test_native_camera_api.py) | 软件测试：原生相机 HTTP API |
| [tests/test_native_camera_manager.py](../tests/test_native_camera_manager.py) | 软件测试：原生双相机管理 |
| [tests/test_native_cameras.py](../tests/test_native_cameras.py) | 软件测试：Ubuntu V4L2 双相机枚举、模式、JPEG 流与采集 |
| [tests/test_native_cameras_streaming.py](../tests/test_native_cameras_streaming.py) | 软件测试：原生相机流与结束排空 |
| [tests/test_release_adapter.py](../tests/test_release_adapter.py) | 软件测试：将上游发行模型的目录和配置适配为本工作台模型 |
| [tests/test_serial_connections.py](../tests/test_serial_connections.py) | 软件测试：Linux 主从臂串口连接、读取、写入与状态 |
| [tests/test_synchronizer.py](../tests/test_synchronizer.py) | 软件测试：关节与相机样本时间同步 |
| [tests/test_telemetry.py](../tests/test_telemetry.py) | 软件测试：实时状态和 SSE 遥测发布 |
| [tests/test_teleop_runtime.py](../tests/test_teleop_runtime.py) | 软件测试：主从臂示教循环、滤波与真实样本发布 |
| [tests/test_training_dataset.py](../tests/test_training_dataset.py) | 软件测试：训练数据准备、完整性检查与转换缓存 |
| [tests/test_training_environment.py](../tests/test_training_environment.py) | 软件测试：独立 Python 环境准备、依赖安装与加速设备自检 |
| [tests/test_training_jobs.py](../tests/test_training_jobs.py) | 软件测试：训练子进程、日志、检查点、停止与恢复 |
| [tests/test_ubuntu_setup.py](../tests/test_ubuntu_setup.py) | 软件测试：Ubuntu 授权、锁等待选项、安装失败提示、中断恢复与重复启动 |
| [tests/test_website_authorization.py](../tests/test_website_authorization.py) | 软件测试：Windows 当前网站连接确认、限时单次令牌与确认界面 |
| [tests/test_windows_execution.py](../tests/test_windows_execution.py) | 软件测试：Windows COM 官方驱动读写、双相机与固定目录 CPU 环境 |
| [tests/touch_model_browser_smoke.cjs](../tests/touch_model_browser_smoke.cjs) | 软件测试：隔离本地服务验证完整 Touch R1 资源、七轴滑块和夹爪模型预览 |
| [tests/training_submission.test.js](../tests/training_submission.test.js) | 软件测试：训练提交编号匹配、旧后台任务核对与准备阶段防重复提交 |
| [tests/urdf_asset_loading.test.js](../tests/urdf_asset_loading.test.js) | 软件测试：模型网格并发、嵌套路径、网络重试、错误定位与切换释放 |
| [tools/build_ld_servo_map.py](../tools/build_ld_servo_map.py) | 从原 LD CAD 生成并核验七颗舵机机壳分组，第五和第六颗同属 link5 |
| [tools/build_runtime_package.py](../tools/build_runtime_package.py) | 构建 Debian 模板、桌面自启动、udev 与浏览器校验值 |
| [tools/capture_docs.cjs](../tools/capture_docs.cjs) | 阻断本机硬件 API，以真实未连接界面生成教程截图 |
| [tools/check_distribution.py](../tools/check_distribution.py) | 校验安装模板、源码一致性、换行、静态文件与资源路径 |
| [tools/check_file_map.py](../tools/check_file_map.py) | 逐文件用途清单生成与遗漏检查 |
| [tools/check_latest_delivery.py](../tools/check_latest_delivery.py) | 核验两份完整交付源码的文件清单与 SHA256，不启动设备 |
| [tools/check_touch_model.py](../tools/check_touch_model.py) | 核验 Touch R1 V3.2 上游校验值、七颗舵机、双夹指和 URDF 从动关系 |
| [tools/export_browser_act.py](../tools/export_browser_act.py) | 提供方网页模型转换的命令行入口，客户不运行 |
| [tools/package_browser_local.py](../tools/package_browser_local.py) | 生成 Windows 本地纯网页测试 ZIP，不包含训练后台或客户模型 |
| [tools/package_latest_delivery.py](../tools/package_latest_delivery.py) | 将已核验的服务器版与 Lumos 本地版重新打包到 dist/latest-delivery |
| [tools/package_lumos_local.py](../tools/package_lumos_local.py) | 打包 Ubuntu Touch R1 与 LumosTouch 本地遥操作源码 |
| [tools/package_site.py](../tools/package_site.py) | 生成含静态网站、图文教程和 SHA256 清单的单个交付 ZIP |
| [tools/package_training_local.py](../tools/package_training_local.py) | 打包包含网页、训练后台与启动器的 Ubuntu 本地测试源码 |
| [tools/serve_local.py](../tools/serve_local.py) | 源码启动入口，检查版本并同端口提供完整网页与 API |
| [tools/start_browser_local.ps1](../tools/start_browser_local.ps1) | 使用 Windows 自带 .NET，仅在环回地址提供静态网页与推理资源 |
| [tools/start_lumos_local.py](../tools/start_lumos_local.py) | 固定版本 Lumos SDK 安装、独立本机服务与重复启动检查 |
| [tools/ubuntu_setup.py](../tools/ubuntu_setup.py) | Ubuntu 系统依赖与组件安装，等待 dpkg 锁、重试下载并解释失败原因 |
