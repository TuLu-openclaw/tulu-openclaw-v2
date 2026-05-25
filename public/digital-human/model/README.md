# 自制半写实数字人模型

本目录中的 `openclaw-avatar.glb` 可由仓库脚本生成：

```powershell
& "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" --background --python scripts/create_aiyu_avatar.py
```

## 当前默认模型

- `openclaw-avatar.glb`
  - 名称：爱羽 / OpenClaw 自制半写实数字人
  - 生成工具：Blender LTS 4.5 + `scripts/create_aiyu_avatar.py`
  - 许可：项目自制资产，见 `OPENCLAW-AIYU-AVATAR-LICENSE.txt`
  - 说明：包含人脸、眼睛、鼻子、嘴、头发、上半身、衣服、手臂、手部、分段动作节点。不是外部下载素材。

## 备用/候选模型

- `openclaw-avatar-xbot.glb`
  - 来源：three.js examples `examples/models/gltf/Xbot.glb`
  - 许可：three.js 仓库 MIT License（见 `THREEJS-MIT-LICENSE.txt`）
  - 说明：免费全身骨骼测试模型，质量较低，不再作为售卖默认模型。

- `openclaw-avatar-head.glb`
  - 名称：Lee Perry-Smith / Infinite 3D Head Scan
  - 许可：Creative Commons Attribution 3.0 Unported（见 `LeePerrySmith_License.txt`）
  - 说明：真实感更强，但只有头部且没有骨骼，保留为候选。
