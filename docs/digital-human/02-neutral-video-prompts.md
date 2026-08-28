# 디지털 휴먼 · 무표정 영상 프롬프트

Omni에서 무표정 원본 이미지를 참조 이미지로 업로드한 뒤 사용함.

## 참조 이미지

- `/Users/yanghyojae/.codex/generated_images/019f5a5d-4d58-7312-9ce9-60179091c803/exec-b60697a9-4e74-46ec-a027-10215ee41380.png`

## 공통 고정 조건

아래 조건은 모든 프롬프트에 포함되어 있음.

- 인물·복장·구도·조명을 참조 이미지와 동일하게 유지함
- 카메라는 고정하고, 확대·축소·이동·컷 전환을 금지함
- 배경은 `#00FF00` 단색 크로마키로 고정함
- 그림자·바닥·소품·글자·로고·워터마크를 넣지 않음

## 4초 발화

```text
Use the supplied reference image as the exact identity reference. Keep the same Korean woman, hairstyle, navy cardigan, gray shirt, age, facial fine lines, frontal mid-torso framing, posture, and soft studio lighting.

She speaks for one continuous 4-second clip with a calm neutral professional expression, relaxed brows, attentive steady eyes, subtle natural blinks, and very small natural head movement. Her Korean conversational mouth movement is natural and not exaggerated. Start and finish in a stable resting pose.

Locked camera. No cut, zoom, pan, camera shake, body turn, hand gesture, extra people, text, captions, logos, or watermark.
The entire background must remain a perfectly flat, uniform chroma-key green: exact #00FF00. No gradient, texture, props, floor, shadow, reflection, halo, vignette, or color changes in the green background.
```

## 6초 발화

```text
Use the supplied reference image as the exact identity reference. Keep the same Korean woman, hairstyle, navy cardigan, gray shirt, age, facial fine lines, frontal mid-torso framing, posture, and soft studio lighting.

She speaks for one continuous 6-second clip with a calm neutral professional expression, relaxed brows, attentive steady eyes, subtle natural blinks, and very small natural head movement. Her Korean conversational mouth movement is natural and not exaggerated. Start and finish in a stable resting pose.

Locked camera. No cut, zoom, pan, camera shake, body turn, hand gesture, extra people, text, captions, logos, or watermark.
The entire background must remain a perfectly flat, uniform chroma-key green: exact #00FF00. No gradient, texture, props, floor, shadow, reflection, halo, vignette, or color changes in the green background.
```

## 8초 발화

```text
Use the supplied reference image as the exact identity reference. Keep the same Korean woman, hairstyle, navy cardigan, gray shirt, age, facial fine lines, frontal mid-torso framing, posture, and soft studio lighting.

She speaks for one continuous 8-second clip with a calm neutral professional expression, relaxed brows, attentive steady eyes, subtle natural blinks, and very small natural head movement. Her Korean conversational mouth movement is natural and not exaggerated. Start and finish in a stable resting pose.

Locked camera. No cut, zoom, pan, camera shake, body turn, hand gesture, extra people, text, captions, logos, or watermark.
The entire background must remain a perfectly flat, uniform chroma-key green: exact #00FF00. No gradient, texture, props, floor, shadow, reflection, halo, vignette, or color changes in the green background.
```

## 8초 청취

```text
Use the supplied reference image as the exact identity reference. Keep the same Korean woman, hairstyle, navy cardigan, gray shirt, age, facial fine lines, frontal mid-torso framing, posture, and soft studio lighting.

Create one continuous silent 8-second listening clip. She keeps a calm neutral attentive expression. Her mouth remains naturally closed and she does not speak or lip-sync. She maintains eye contact, blinks naturally once or twice, breathes subtly, and gives one very small attentive nod near the middle. Start and finish in the same stable listening pose for seamless looping.

Locked camera. No cut, zoom, pan, camera shake, body turn, hand gesture, extra people, text, captions, logos, or watermark.
The entire background must remain a perfectly flat, uniform chroma-key green: exact #00FF00. No gradient, texture, props, floor, shadow, reflection, halo, vignette, or color changes in the green background.
```

## 출력 메모

- 발화 영상은 실제 대사 음성을 넣지 않으면 임의의 입 모양만 생성됨. 특정 TTS와 입 모양을 맞춰야 하면 그 음성을 Omni의 립싱크 입력으로 함께 넣어야 함.
- 모든 클립의 해상도·프레임레이트·화면비는 하나로 통일함.
