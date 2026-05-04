<div align="center">

<img src="./assets/logo.png" alt="MioDraw Logo"/>

### MioDraw：你的私人 AI 绘图与灵感优化本地工作站

一款致力于极简、高效的使用API生图模式为主的 AI 绘图与提示词优化本地工作站

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/github/v/release/Fox-Fox-Mio/MioDraw)](https://github.com/Fox-Fox-Mio/MioDraw/releases)
[![Platform](https://img.shields.io/badge/platform-Windows)](#)
[![Downloads](https://img.shields.io/github/downloads/Fox-Fox-Mio/MioDraw/total)](https://github.com/Fox-Fox-Mio/MioDraw/releases)

[**直接下载 (Releases)**](https://github.com/Fox-Fox-Mio/MioDraw/releases) · [**使用说明文档**](#) · [**报告 Bug**](https://github.com/Fox-Fox-Mio/MioDraw/issues)

</div>

---

## 写在前面
1. 本软件80%以上代码使用AI工具开发，如果您不能接受，请不要下载本软件qwq
2. 本软件是作者的第一个开源项目，因此项目维护，整体管理都是新手水平，还请多多包涵，勿喷QAQ
3. 由于作者学业原因，本项目后续更新/维护可能会较为缓慢，见谅
4. 欢迎加入狐狐澪的QQ交流群：1082998626 共同聊天与讨论哦qwq

## 为什么选择 MioDraw？

在网页端生图受限于网络波动？云端图库管理混乱且隐私无法保障？不会写复杂的 AI 提示词？
**MioDraw** 专为解决这些痛点而生，原生运行于你的桌面，提供极致的性能与隐私保护。

## 核心特性 (Features)

### 1. 极致生图体验，多节点并发
- **灵活配置**：支持自由配置多个 API 站点（兼容 OpenAI 格式及各类中转接口）。
- **多接口适配**：原生支持 `图片模型 (/images/generations)`、`Chat 模型 (/chat/completions)` 与 `Responses 接口`。
- **并发控制**：强大的任务系统，实时监控每个并发任务的进度与耗时，支持随时**一键物理打断**。
- **精准作画**：支持多张本地参考图上传，提供从 1K 到 4K 的十余种主流画幅比例预设（支持自定义）。

### 2. 本地图库，隐私无忧
- **数据安全**：所有配置、API Key 与生成的图片**完全保存在本地文件系统**，绝无云端上传。
- **丝滑浏览**：内置底层 C++ 缩略图加速，浏览几百张 4K 图片也毫无卡顿。
- **优雅管理**：支持“等比方格”与“瀑布流”双模式切换；支持新建相册、一键收藏、导出与重命名等。
- **数据迁移**：支持一键将海量图片数据无损迁移至其他盘。

### 3. AI 提示词优化助手
- **内置大模型对话**：拥有独立配置的 Chat 节点，支持流式输出。
- **一键灵感爆发**：在生图界面遇到瓶颈？点击“一键优化”，AI 将根据你输入的短句，自动扩展为结构清晰、细节丰富的专业英文/中文双版本提示词。
- **多会话管理**：左侧独立会话列表，支持历史记录保留、重命名与删除。

### 4. 释放显卡性能：本地离线超分 (Upscale)
- **画质无限突破**：深度集成开源的 `Real-ESRGAN` 离线超分引擎。
- **零成本高清**：完全调用本地 GPU 算力，不消耗任何 API 额度，一键将低分辨率原图无损放大 2 倍至 4 倍。
- **多模型支持**：内置二次元专属（动漫插画）与真实摄影等多种算法模型动态切换。

### 5. 细节打磨
- **个性化外观**：支持暗色/亮色双主题，支持自定义全局半透明背景图。
- **底层代理网络**：彻底告别浏览器跨域拦截（CORS），连接更稳定。
- **错误监控**：内置详尽的运行错误日志面板及常见报错对照手册，排障更轻松。

---

## 安装与运行 (Installation)

### 普通用户 (直接使用)
前往 [Releases 页面](https://github.com/Fox-Fox-Mio/MioDraw/releases) 下载最新版本的安装包：
- `MioDraw-Setup-xxx.exe`：标准安装向导版（推荐）
- `MioDraw-Portable-xxx.exe`：单文件便携版 （直接下载点击即用，但稳定性未测试）
- `MioDraw-xxx.zip`：免安装绿色压缩包（直接下载一键解压即用，推荐）

### 开发者 (本地编译)
如果您想亲自修改代码或构建属于自己的版本：

#### 1. 克隆仓库
git clone https://github.com/Fox-Fox-Mio/MioDraw.git

#### 2. 进入目录
cd MioDraw

#### 3. 安装依赖 (推荐使用 npm 镜像加速)
npm install

#### 4. 下载本地超分引擎并确认项目结构 (必做)
### 请前往 Real-ESRGAN 官方下载 Windows Vulkan 版本，并将其放置于 resources/upscaler/ 目录下。

项目目录结构要求 (Project Structure)

miodraw/
 ├── resources/
 │   └── upscaler/
 │       ├── realesrgan-ncnn-vulkan.exe  # 核心超分引擎程序
 │       ├── vcomp140.dll
 │       ├── vcomp140d.dll
 │       └── models/                     # 存放不同算法的超分模型
 │           ├── realesr-animevideov3-x2.bin
 │           ├── realesr-animevideov3-x2.param
 │           ├── realesrgan-x4plus.bin
 │           ├── realesrgan-x4plus.param
 │           ├── realesrgan-x4plus-anime.bin
 │           └── ... (其他模型及参数文件)
 ├── src/                                # Vue 前端源代码
 │   ├── components/                     # 独立组件 (如对话助手、图片详情等)
 │   ├── pages/                          # 主页面 (生成页、图库页、设置页)
 │   ├── stores/                         # Pinia 状态管理
 │   └── utils/                          # API 请求及本地存储工具类
 ├── electron/                           # Electron 主进程及预加载脚本
 │   ├── main.cjs
 │   └── preload.cjs
 ├── public/                             # 静态资源 (图标等)
 ├── package.json                        # 项目配置及依赖
 └── vite.config.js                      # Vite 构建配置

#### 5. 启动开发环境
npm run dev

#### 6. 打包构建
npm run build

## 免责声明 (Disclaimer)
本软件为免费开源的图形化桌面客户端，仅供个人学习、研究与交流使用，严禁用于任何商业营利目的。
本软件本身不包含、不提供任何云端大模型服务，用户需自行合法合规地配置第三方 API。
请用户严格遵守所在国家或地区的法律法规，严禁利用本软件生成、传播任何非法或违规内容，一切法律后果由用户自行承担。
详见软件以及使用手册内置的《MioDraw 软件免责声明》。

## 参与贡献 (Contributing)
非常欢迎任何形式的贡献！如果你有好的想法、发现了 Bug，或是改进了某些功能，请随时提交 Pull Request 或开启 Issue。

## 开源协议 (License)
本项目基于 [MIT License](LICENSE) 协议开源。
