# OpenClaw 数字人模型目录

方案 C 使用这里的本地模型进行售卖版打包。

## 当前默认模型

- `openclaw-avatar.glb`
  - 名称：Lee Perry-Smith / Infinite 3D Head Scan
  - 来源：three.js examples `examples/models/gltf/LeePerrySmith/LeePerrySmith.glb`
  - 原始来源：www.triplegangers.com
  - 许可：Creative Commons Attribution 3.0 Unported（见 `LeePerrySmith_License.txt`）
  - 说明：这是目前找到的更高质量免费真人头部 GLB。它不是全身数字人，但真实感明显高于 Xbot。用于售卖版时必须保留署名和许可证文件。

## 备用模型

- `openclaw-avatar-xbot.glb`
  - 来源：three.js examples `examples/models/gltf/Xbot.glb`
  - 仓库：https://github.com/mrdoob/three.js
  - 许可：three.js 仓库 MIT License（见 `THREEJS-MIT-LICENSE.txt`）
  - 说明：免费全身人形测试模型，质量一般，但适合验证骨骼/动作加载。

## 替换规则

1. 如获得更高质量且可商用再分发的模型，替换为同名 `openclaw-avatar.glb` 即可。
2. 必须保留对应 LICENSE / 来源说明。
3. 不要提交来源不明、禁止再分发的模型。
4. 模型不存在或加载失败时，OpenClaw 主聊天页会自动回退到 `public/digital-human/openclaw-avatar.svg`，不会影响应用启动。
