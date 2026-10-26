# 完整网站部署

本教程面向网站维护人员。服务器托管静态网页，机械臂、相机和运行环境位于客户电脑。

## 下载

在 [最新发布](https://github.com/VincentHSS/Star-Arm-102-Web-ACT/releases/latest) 下载 `Star-Arm-102-SERVER-FINAL-v1.0.35.zip`。它包含完整控制台、ACT 工作台、网页执行、模型和 Ubuntu 组件。

```text
Star-Arm-102-SERVER-FINAL-v1.0.35/
  服务器网页/                 ← 只上传这里的全部内容
    index.html
    act-workbench.html
    act-browser.html
    urdf-preview.html
    src/
    assets/
    downloads/                ← Ubuntu 安装文件与模板
  部署说明.md
  SHA256SUMS
```

Lumos 专用 Ubuntu ZIP 用于客户本机运行，不上传到服务器。整个 GitHub 源码用于维护；当前服务器交付源码位于 `delivery/Star-Arm-102-SERVER-FINAL-v1.0.35/`。

## 上传

1. 备份原网站目录。
2. 将 `服务器网页/` 内的全部文件上传至目标网站目录，保留目录层级及文件名大小写。
3. 网站目标目录下应直接存在 `index.html`，不要多套一层压缩包名称。
4. 启用有效 HTTPS，清理该路径的 CDN 及浏览器旧缓存，再用桌面 Chrome / Edge 打开。

网站可以放在域名根目录或子目录。更新时一起替换 HTML、`src/`、`assets/` 和 `downloads/`；只换首页可能混用旧脚本。

## 资源配置

| 项目 | 要求 |
| --- | --- |
| JavaScript | 返回 JavaScript MIME，不存在的文件返回 404 |
| WASM | `application/wasm` |
| `.bin`、`.STL`、`.deb` | 原样提供，不改写资源内容或文件名大小写 |
| 已压缩模型 `.bin` | 不人为添加 `Content-Encoding: gzip` |
| Range 下载 | 支持时返回正确的 206 / Content-Range；不支持时可返回完整 200 |
| HTML / JS 更新 | 使用可重新验证的缓存策略，发布后清理旧缓存 |

当前资源加载保留原始 STL 回退；压缩模型和原始模型都属于运行文件。服务器无需安装 Python、Lumos SDK 或训练环境。

## 客户 Ubuntu 安装

客户在设备所在的 Ubuntu 电脑打开同一个 HTTPS 网站，按页面提示下载对应 `.deb`。以当前发布文件为例，在下载目录安装：

```bash
sudo apt install ./star-arm-lumos_1.0.32_fashionstar_amd64.deb
```

ACT 组件的当前预生成文件为 `star-arm-act_1.0.23_fashionstar_all.deb`，按实际下载文件名安装。

组件会在本机运行，浏览器提示本机网络访问时按使用需求授权。预生成安装文件绑定 `https://fashionstar.com.cn`；迁移域名时，从新网站页面下载对应网站的专属安装文件，不直接复用旧域名安装文件。

## 验收

- 首页三维模型加载，控制台、ACT 工作台和网页执行入口可打开。
- `src/app.js`、模型及安装文件返回实际资源，不是首页 HTML。
- 更新后控制台显示 `srv1.0.35`；这是服务器运行版本，文档整理版不改控制逻辑。
- 在客户 Ubuntu 电脑确认本机组件连接，再按 [ACT 教程](ACT_GUIDE.md) 或 [Lumos 教程](LUMOS_TELEOP.md) 验证对应用途。

完整平台页面说明见 [控制台教程](CONSOLE_GUIDE.md)，安装与权限问题见 [Ubuntu 教程](UBUNTU.md) 和 [常见问题](TROUBLESHOOTING.md)。
