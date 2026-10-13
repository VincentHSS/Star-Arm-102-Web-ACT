# 开发、检查与打包

普通客户无需安装 Node.js。开发检查使用 Python 3.10～3.12 和 Node.js 22 或更新版本。

```sh
npm ci
npm test
python -X utf8 -m unittest discover -s tests -p 'test_*.py'
python tools/build_runtime_package.py
python tools/check_distribution.py
python tools/check_file_map.py
python tools/package_site.py
```

在代理环境中请让 `localhost` / `127.0.0.1` 的测试请求绕过代理。Windows PowerShell 可设置 `$env:NO_PROXY='localhost,127.0.0.1,::1'`，以免系统代理代替本机后台返回错误。

浏览器检查：

```sh
npx playwright install chromium
npm run test:browser
```

该检查会临时启动本机后台，不连接机械臂、不安装 GPU 训练依赖，验证页面加载、API、自动环境准备界面、模型管理、安装包生成、移动屏幕与两页切换。整套检查需独占 18765，应在没有连接硬件的独立测试环境运行。

仅检查相机步骤切换时，可运行 `node tests/camera_navigation_smoke.cjs`。它使用随机回环端口与模拟视频流，并阻断客户服务 18765；覆盖浏览器与原生预览在 1↔4↔3 多次切换时保留连接、过期状态不能关闭新相机，以及浏览器预览不能自行满足真实执行门槛。不会连接物理相机或串口。

修改 `ai_service/`、`runtime/` 或安装组件内容后，运行 `build_runtime_package.py`。它重建网站内的 `.deb` 模板并更新浏览器模板校验值；不能只更新其中一份。修改文件结构后使用 `python tools/check_file_map.py --write` 重建逐文件说明，再检查。

`package_site.py` 只生成一个交付 ZIP 到 `dist/`：静态资源在 `服务器网页`，图文教程与截图在 `使用教程`。教程不参与网站加载。不打入后台源码、临时日志、测试、模型、校准、示教数据或开发依赖。客户运行源码时从 GitHub 下载源码 ZIP，服务器发布使用 Release 的网站 ZIP。

## 更新教程截图

安装 Playwright 与 Chromium 后，在仓库根目录运行：

```sh
node tools/capture_docs.cjs
```

工具启动临时静态服务，阻断 `127.0.0.1:18765` 的本机 API 请求，仅拍摄实际网页的未连接状态。不会连接设备、录制数据或启动训练；表单示例只填写不提交。截图输出到 `docs/images/`，完成后关闭临时浏览器与服务。若本机使用已有 Edge，可设置 `PLAYWRIGHT_BROWSER_CHANNEL=msedge`；Python 命令不是 `python` 时可设置 `PYTHON=python3`。

截图更新后逐张检查文字与布局，并核对教程按钮名称与真实界面一致。不要把未连接截图写成已完成训练或实机执行的证据。

GitHub Actions 自动运行 JavaScript / Python 软件检查、安装包结构和文件说明检查。软件测试验证协议、队列、校准、数据集、模型导入及界面约束；它们不能替代 Ubuntu 系统安装、相机、串口、GPU 或机械臂实机验收。

## Windows 执行验证记录（2026-10-13）

在 Windows / Python 3.12.5 实际完成 CPU 执行环境安装与 LeRobot 0.4.4 自检，并加载 act-pick-v1.0.0 原始发布权重，通过策略进程输出 100 个动作、每个 7 个有限关节值。输入为生成图像与仅用于离线测试的模拟校准；没有连接机械臂，不代表任务成功率或实际运动效果。

浏览器验证覆盖 Windows 环境就绪、隐藏训练表单、服务器网页连接确认、确认前拒绝访问、一次令牌不可重放及服务器网页不能自行授权其他网站。COM 驱动和 DirectShow 流生命周期使用模拟设备测试。NVIDIA CUDA、真实 COM 舵机和 USB 双相机仍需在目标设备验收。

## Windows 纯网页执行验证（2026-10-13）

`node tests/browser_direct_smoke.cjs` 在独立随机端口启动纯静态网站，不启动 API 后台，模拟双相机和串口来验证导入、只读校验、动作发送、停止及端口关闭。显式阻断客户 18765 端口。CI 使用模拟策略线程，不声称验收真实模型或硬件。

本机使用 `BROWSER_ACT_REAL_MODEL` 指定真正转换的 ACT 模型 ZIP，并设置 `PLAYWRIGHT_BROWSER_CHANNEL=msedge`，已完成真实 Worker / WebGPU 模型加载与同一流程，执行阶段本机 API 请求数为 0；UART 和相机仍为模拟设备。上游实权重转换后使用三组输入，与原 PyTorch 策略和实际处理器比较，最大绝对误差约 0.000034。浏览器 WebGPU 对比误差约 0.000031。没有实机运动验收，也不保证每台电脑达到目标频率。

转换时使用张量拼接保留原 ACT 编码语义，避免导出数百路 Split/Concat 超过浏览器 GPU 缓冲绑定上限。模型图固定批次 1 和训练图像规格，不随意压缩、量化或更换权重。客户包排除模拟或其他机械臂校准。
