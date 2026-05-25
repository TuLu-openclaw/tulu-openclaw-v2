# OpenClaw 数字人模型目录

方案 C 使用这里的本地模型进行售卖版打包。

## 当前默认模型

- `openclaw-avatar.glb`
  - 当前默认：Xbot 全身骨骼模型
  - 来源：three.js examples `examples/models/gltf/Xbot.glb`
  - 仓库：https://github.com/mrdoob/three.js
  - 许可：three.js 仓库 MIT License（见 `THREEJS-MIT-LICENSE.txt`）
  - 说明：这是带骨骼和动画的全身 GLB，当前用于真实 3D 数字人的骨骼驱动、姿态切换和状态动作。

## 高质量候选模型

- `openclaw-avatar-head.glb`
  - 名称：Lee Perry-Smith / Infinite 3D Head Scan
  - 来源：three.js examples `examples/models/gltf/LeePerrySmith/LeePerrySmith.glb`
  - 原始来源：www.triplegangers.com
  - 许可：Creative Commons Attribution 3.0 Unported（见 `LeePerrySmith_License.txt`）
  - 说明：真实感更强，但只有头部且没有骨骼，不适合作为默认“真实数字人”。保留为高质量头像候选。

## 替换规则

1. 如获得更高质量且可商用再分发的全身/半身骨骼模型，替换为同名 `openclaw-avatar.glb` 即可。
2. 必须保留对应 LICENSE / 来源说明。
3. 不要提交来源不明、禁止再分发的模型。
4. 模型不存在或加载失败时，OpenClaw 主聊天页会自动回退到 `public/digital-human/openclaw-avatar.svg`，不会影响应用启动。
