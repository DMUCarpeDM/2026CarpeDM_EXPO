# 서비스 영상과 이미지

## 현재 직장 대화 영상

`mvp/src/assets/workplace-videos/{morning,work,leaving}/`에 장소별 6종씩 총 18개 MP4를 사용합니다. 동일한 가상의 여성 캐릭터이며 출근 로비·업무 사무실·퇴근 저녁 복도 배경이 영상에 포함됩니다. 2160×3840 세로 9:16, 24fps, 8초, 무음입니다. 음성은 별도 TTS로 재생하며 정밀한 립싱크 영상은 아닙니다.

| 파일 | 용도 |
| --- | --- |
| speaking-base.mp4 | 기본 발화 |
| joy.mp4 | 기쁨·긍정 반응 |
| disappointment.mp4 | 아쉬움 |
| irritation.mp4 | 불편함 |
| anger.mp4 | 부정 반응 |
| listening.mp4 | 듣기·대기 |

`characterMedia.js`에서 캐릭터 기본 장소와 장면별 영상을 선택합니다. 스마트 미러는 현재 시나리오의 category를 전달하므로 해당 장소의 영상을 사용합니다. 배경 포함 영상에는 크로마키·가장자리 마스크를 적용하지 않습니다. 이전 공용 영상 5개는 삭제했습니다.

파일 SHA-256·검증 범위는 [생성 기록](media/workplace-videos/manifest.json)에 있습니다. 전체 영상의 규격을 확인했으며 전체 재생을 통한 표정·움직임 검수는 별도로 필요합니다.

## 다른 서비스 자산

`mvp/src/assets/team-lead-videos/`의 8개 영상은 일반 연습·카페 응대에서 사용하므로 유지합니다. 요약용 형상화 이미지와 은색 빌딩 배경은 `mvp/src/features/smart-mirror/assets/`에서 관리합니다.
