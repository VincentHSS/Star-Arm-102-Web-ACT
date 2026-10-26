# Star Arm 102 数字孪生平台

## 最新交付版本

[下载 v1.0.38 发布包](https://github.com/VincentHSS/Star-Arm-102-Web-ACT/releases/tag/v1.0.38) · [交付源码与使用入口](delivery/README.md)

| 下载包 | 用途 |
| --- | --- |
| [Star-Arm-102-SERVER-FINAL-v1.0.35.zip](https://github.com/VincentHSS/Star-Arm-102-Web-ACT/releases/download/v1.0.38/Star-Arm-102-SERVER-FINAL-v1.0.35.zip) | 完整服务器版：控制台、ACT 工作台、模型资源和 Ubuntu 组件；包含模型加载提速与缓存 |
| [Star-Arm-102-Lumos-Ubuntu-v1.0.38.zip](https://github.com/VincentHSS/Star-Arm-102-Web-ACT/releases/download/v1.0.38/Star-Arm-102-Lumos-Ubuntu-v1.0.38.zip) | Lumos 专用 Ubuntu 客户交付版：简化布局、保留控制与校准、自动选择本地端口 |

通过 Code → Download ZIP 下载整个仓库时，最新交付版位于 `delivery/`。Lumos 本地使用入口：

```bash
cd delivery/Star-Arm-102-Lumos-Ubuntu-v1.0.38
bash start_ubuntu_lumos.sh
```

以下为原开发工程与完整平台教程。直接部署或交付客户请优先使用上面的发布包。

---

平台集成 Star Arm 102 控制台与 ACT 工作台，提供机械臂控制、三维可视化、双相机数据采集、模型训练、模型导入与实机执行功能。

**ACT 训练使用 Ubuntu；Windows 客户支持纯网页执行转换好的模型，无需安装 Python、PyTorch 或本机服务。** 网站可以放在服务器上，机械臂、相机、数据和 GPU 仍在客户电脑上。服务器不连接机械臂，也不执行训练。

**Windows 客户直接执行：[纯网页图文教程](docs/BROWSER_EXECUTION.md)。** 打开网站中的 `act-browser.html`，导入网页执行模型、授权相机和串口、校验后执行。提供方在第 3 步点击“导出 Windows 网页模型”生成客户包；不是让客户把普通权重改名或安装运行环境。

页面顶部的“当前工作区”菜单统一切换控制台、ACT 工作台和网页执行。**ACT 第 1 步配置本机采集连接并采集，第 2 步再准备训练环境**；采集不用先安装 PyTorch / LeRobot。

**Touch R1 → 实体 LumosTouch：使用 Ubuntu + CAN。** 下载源码后运行 `sh start_ubuntu_lumos.sh`，在本机控制台完成连接、六轴及夹爪校准、目标预览和遥操作。实体 LumosTouch 只接受 Touch R1 配对，夹爪随主臂 ID 6 开合；详情见 [LumosTouch 遥操作](docs/LUMOS_TELEOP.md)。Windows 可预览这两款模型，实体 LumosTouch 的 CAN 控制需要 Ubuntu 组件。

**第一次使用先看 [图文快速上手](docs/GETTING_STARTED.md)。** 教程包含实际界面截图，按按钮位置说明控制台连接、从臂校准、双相机、数据集创建、环境准备、模型导入和执行。截图为未连接硬件状态，不代表实机验证结果。

![Star Arm 102 控制台](docs/images/console-overview.png)

## 图文教程入口

| 你要做什么 | 打开哪份教程 |
| --- | --- |
| 第一次使用，选下载包和操作路线 | [图文快速上手](docs/GETTING_STARTED.md) |
| 连接设备、三维查看、主从控制、舵机设置 | [控制台图文教程](docs/CONSOLE_GUIDE.md) |
| Touch R1 控制实体 LumosTouch（Ubuntu CAN） | [LumosTouch 遥操作](docs/LUMOS_TELEOP.md) |
| 采集、校准、训练、导入完整模型、实机推理 | [ACT 四步骤图文教程](docs/ACT_GUIDE.md) |
| 客户首次安装或 Ubuntu 本地源码启动 | [Ubuntu 详细教程](docs/UBUNTU.md) |
| Windows 启动、准备环境并执行 Ubuntu 训练模型 | [Windows 详细教程](docs/WINDOWS.md) |
| 把唯一交付包上传到服务器 | [服务器上传与验收教程](docs/DEPLOYMENT.md) |
| 按钮、组件、相机、串口、校准或模型有问题 | [常见问题](docs/TROUBLESHOOTING.md) |

## 我应该下载哪个？

- **上传网站的运营者：** 到 [Releases](https://github.com/VincentHSS/Star-Arm-102-Web-ACT/releases/latest) 下载 `Star-Arm-102-SERVER-FINAL-v1.0.35.zip`。将其中 `服务器网页` 文件夹里的内容上传到网站目录，启用 HTTPS。无需填写发布配置或网站地址。
- **在电脑上运行源码：** 点击 GitHub 的 **Code → Download ZIP**，解压后按下面的 Ubuntu 或 Windows 步骤启动。它包含网站、后台和两种启动脚本。
- **通过服务器网站使用 ACT 的客户：** 打开 ACT 第 1 步，在“配置采集连接”中完成首次 Ubuntu 组件安装；连接后即可采集。需要训练时再到第 2 步准备训练环境。客户不需要下载源码、填写后台地址或输入训练命令。

交付 ZIP 的 `使用教程` 文件夹也包含图文教程和截图，仍然只有一个交付包；运营者不需要将教程图片上传到网页资源目录。

## Ubuntu 本地启动

适用于 Ubuntu 22.04 / 24.04，Python 3.10～3.12，Chrome / Edge。

```sh
cd Star-Arm-102-Web-ACT
sh start_ubuntu.sh
```

脚本先检查系统依赖，只安装缺失的项目，首次按 Ubuntu 弹窗完成安装授权即可。系统更新占用 dpkg 锁时等待最多 5 分钟，安装输出持续显示；已有服务会复用。使用系统 Python，避免已激活的 Conda 环境干扰。

随后打开 `http://127.0.0.1:18765/`。进入 ACT，第 2 步自动准备独立的 LeRobot / PyTorch 环境；临时网络错误有限重试，服务中断后可点击“重试准备”。采集、校准、训练和模型执行都通过网页操作。

详见 [Ubuntu 教程](docs/UBUNTU.md)、[ACT 操作教程](docs/ACT_GUIDE.md)。

## Windows（可选本机源码方式） 本地启动

安装 Python 3.10～3.12，安装时勾选 **Add Python to PATH**。解压源码后双击根目录的 **`start_windows.bat`**，浏览器会自动打开控制台。

Windows 纯网页客户按上方教程操作。以下源码启动方式支持控制台和 **ACT 已训练模型的本机 LeRobot 执行**。双击启动脚本后，第 2 步准备 Windows 运行环境，第 3 步导入 Ubuntu 导出的完整模型包，第 4 步连接 COM 从臂和本机原生双相机。运行支持 NVIDIA CUDA 或 CPU，CPU 的实际频率以测试为准；**模型训练仍使用 Ubuntu**。详见 [Windows 教程](docs/WINDOWS.md)。

控制台子页面和 ACT 步骤切换时会自动停止当前控制并释放串口；在下一页操作机械臂前需重新连接。ACT 步骤之间保留双相机连接，第 1、4 步共用预览；切回控制台时释放相机。按钮处理中会显示状态，本机服务无响应时会提示超时。

## 服务器发布与文件说明

- [服务器上传教程](docs/DEPLOYMENT.md)：上传哪些文件、HTTPS、客户首次安装流程。
- [每个文件的用途](docs/FILE_MAP.md)：逐文件列出前端、后台、资源、运行组件、测试与脚本。
- [运行架构](docs/ARCHITECTURE.md)：浏览器、电脑后台与独立 ACT 环境的关系。
- [常见问题](docs/TROUBLESHOOTING.md)：启动错误、组件未连接、串口和相机问题。
- [开发与检查](docs/DEVELOPMENT.md)：软件验证、打包与持续集成。
- [第三方组件](THIRD_PARTY.md)：来源与许可位置。

仓库不包含客户的模型权重、示教数据、校准文件、账号密钥或训练环境。3D STL / URDF 是页面显示所需资源，不能当作多余文件删除。

本版提供软件检查和浏览器验证；Windows 相机与 COM、CUDA 加速、Ubuntu 系统安装及机械臂实际运动仍需在目标电脑验收。
