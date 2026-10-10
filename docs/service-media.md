# 서비스 영상과 이미지

## 현재 직장 대화 영상

`mvp/src/assets/workplace-videos/`의 5개 MP4가 제품 원본입니다. 모두 가상의 여성 캐릭터, 2160×3840 세로 9:16, 24fps, 8초, 오디오 없는 영상입니다. 음성은 별도 TTS로 재생하며 정밀한 립싱크 영상은 아닙니다.

| 파일 | 용도 |
| --- | --- |
| speaking-base.mp4 | 기본 발화·듣기 대체 |
| joy.mp4 | 기쁨·긍정 반응 |
| disappointment.mp4 | 아쉬움 |
| irritation.mp4 | 불편함 |
| anger.mp4 | 부정 반응 |

매핑은 `mvp/src/data/characterMedia.js`, 상태 선택은 `mvp/src/lib/workplaceEmotion.js`, 재생은 `mvp/src/components/practice/CounterpartVideo.jsx`에서 관리합니다. 같은 영상의 생성·검토용 복사본은 보관하지 않습니다.

생성 설정·현재 영상 SHA-256·최종 프롬프트·인물 참조는 [생성 기록](media/workplace-videos/manifest.json)에 있습니다. Google Vertex AI Veo 3.1로 생성했으며 일부 미세한 미소·고개 움직임은 남아 있습니다.

## 다른 서비스 자산

`mvp/src/assets/team-lead-videos/`의 8개 영상은 일반 연습·카페 응대 캐릭터가 실제 사용하므로 유지합니다. 파일 나이만으로 삭제하지 않습니다.

스마트 미러의 출근·업무·퇴근 형상화 PNG, 실사 시뮬레이션 배경, 은색 빌딩 배경은 `mvp/src/features/smart-mirror/assets/`에서 관리합니다. 제품 이미지가 검토 페이지 폴더를 참조하지 않도록 빌딩 자산도 이곳으로 통합했습니다.
