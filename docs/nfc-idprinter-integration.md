# 스마트 미러 NFC → IDPrinter 리포트 출력

대상: [sdg331/CarpeDM_EXPO_IDPrinter](https://github.com/sdg331/CarpeDM_EXPO_IDPrinter).
**프린터 키오스크와 Windows 스마트 미러를 서로 다른 기기에서 실행하는 구성**이다.

리포트를 출력하는 관람객 흐름은 **출력 키오스크에서 사원증 발급 → 같은 카드로 미러 태그 → 대화·분석 → 출력 키오스크에서 같은 카드로 퇴근 리포트 조회·출력**이다. 미러는 미발급 NFC 카드도 시작 버튼처럼 사용할 수 있다. 등록되지 않은 카드, 사원증 조회 실패 또는 화면 터치로 시작한 체험은 익명 체험이며, 출력용 사원증 방문 기록에는 연결되지 않는다.

## 양쪽 주소 설정

두 기기를 같은 LAN 또는 아래 Tailscale 사설망에 연결하고 각 기기의 IPv4 주소를 확인한다. LAN 주소는 Windows의 `ipconfig`, Raspberry Pi의 `hostname -I`로 확인한다. LAN을 사용한다면 주소가 바뀌지 않도록 공유기에서 주소를 예약하는 편이 좋다.

- 미러 브라우저: 미러 PC의 `http://localhost:5173/?mirror=1&service=workplace`
- 프린터 브라우저: 프린터 기기의 `http://localhost:8002/` (실제 운영 포트를 쓴다)
- 미러 → 프린터: `http://<프린터-IP>:8002`
- 프린터 → 미러: `http://<미러-IP>:8001`

다른 기기에 전달하는 서버 주소에 `localhost`, `127.0.0.1`, `0.0.0.0`을 넣으면 안 된다. `0.0.0.0`은 **서버 실행의 수신 주소**에만 사용한다. 브라우저는 자기 기기의 localhost로 열어 카메라·마이크 권한과 로컬 운영 API를 사용한다.

### 미러는 유선, 프린터는 휴대폰 핫스팟인 경우

기존 인터넷 연결을 유지하고 양쪽에 [Tailscale](https://tailscale.com/docs/how-to/connect-to-devices)을 설치하면 서로 다른 인터넷망에서도 연결할 수 있다. 두 기기는 같은 계정의 사설망에 로그인한다.

Windows에는 [공식 설치 파일](https://tailscale.com/docs/install/windows)을 설치하고 로그인한다. Raspberry Pi 터미널에서는 [공식 Linux 설치 절차](https://tailscale.com/docs/install/linux)를 실행한다.

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4
```

Windows PowerShell에서도 주소를 확인한다.

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" ip -4
```

아래 설정 명령의 `<프린터-IP>`와 `<미러-IP>`에는 각 기기의 **Tailscale `100.x.x.x` 주소**를 넣는다. 이 구성에서는 휴대폰 핫스팟의 `172.20.10.x` 주소와 유선망 주소를 섞어 쓰지 않는다. 프린터·미러 서버의 수신 설정, 공유 토큰, 포트는 아래와 동일하다. 로컬 브라우저 주소는 계속 localhost를 사용한다.

Tailscale만 설치해도 프린터 서버가 자동 실행되는 것은 아니다. 로그인 후 서버 실행과 리포트 조회를 각각 확인한다. Windows 방화벽을 조정해야 한다면 프린터의 Tailscale IP에서 TCP 8001로 오는 요청만 허용하며, Tailscale 인터페이스의 실제 네트워크 프로필도 확인한다.

### 서버 간 연결 설정 적용

미러 저장소 루트의 PowerShell에서 실제 두 IP로 아래를 실행한다.

```powershell
.\poc\backend\.venv\Scripts\python.exe .\scripts\idprinter-link.py configure --kiosk-url http://<프린터-IP>:8002 --mirror-url http://<미러-IP>:8001
```

이 명령은 기존 미러 `.env`를 `.local-setup/idprinter-link/`에 백업하고, 모델·음성·API 키 설정을 보존하면서 NFC 연결 항목만 갱신한다. 공유 토큰이 없으면 새로 생성하고, 있으면 보존한다. 기존 프린터 토큰을 유지하려면 해당 토큰만 담은 로컬 파일을 `--token-file <경로>`로 지정한다. 비밀을 명령 인자나 채팅에 붙여넣지 않는다.

생성되는 `.local-setup/idprinter-link/idprinter.env`를 프린터 운영자에게 비공개로 전달하고, **프린터의 기존 `.env`에 해당 항목만 병합**한다. 기존 `.env` 전체를 교체하지 않는다. 파일에는 다음 내용이 들어 있다.

| 프린터 설정 | 의미 |
| --- | --- |
| `KIOSK_HOST=0.0.0.0` | 미러의 인증된 브리지 요청 수신 |
| `KIOSK_PORT` | 설정한 프린터 URL의 포트 |
| `KIOSK_NFC=pcsc` | 실물 PC/SC 리더 사용 |
| `KIOSK_MIRRORTING_URL` | 미러 PC의 LAN 주소와 8001 포트 |
| `KIOSK_BRIDGE_TOKEN` | 미러 서버와 동일한 공유 토큰 |

미러에는 `MIRROR_TING_IDPRINTER_BASE_URL`, `MIRROR_TING_IDPRINTER_BRIDGE_TOKEN`, `MIRROR_TING_NFC_BRIDGE_ENABLED=true`, `MIRROR_TING_NFC_READER_ROLES=mirror`가 저장된다. 비밀 파일은 Git에서 제외되는 `.env`와 `.local-setup/`에만 둔다.

## 재시작과 네트워크

미러에서 기존 백엔드를 종료한 뒤 다음처럼 실행한다.

```powershell
.\start-exhibition.ps1 -PrinterLink
```

이 옵션은 백엔드를 `0.0.0.0:8001`로 시작한다. 이미 실행 중인 프로세스의 수신 주소는 바꾸지 않는다. 백엔드만 직접 실행할 때는 `poc/backend`에서 다음을 사용한다.

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --no-access-log --no-proxy-headers
```

프린터 저장소에서는 `.env` 병합 후 `python scripts/run_kiosk.py`로 재시작한다. 프린터 URL의 포트와 실행 포트가 같아야 한다. worker는 1개를 사용한다.

Windows 방화벽은 개인 네트워크에서 **프린터 IP → 미러 TCP 8001**만 허용하고, 프린터 기기에서도 미러 IP에서 운영 포트로 들어오는 요청을 허용한다. Windows 예시(관리자 PowerShell, 실제 IP로 치환):

```powershell
New-NetFirewallRule -DisplayName 'MirrorTing IDPrinter' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8001 -RemoteAddress <프린터-IP> -Profile Private
```

프린터 방문자 API는 같은 프린터 기기에서 사용하고, 미러는 토큰으로 인증되는 `/api/integrations/mirrorting/*`만 호출한다. 인터넷 공유기의 포트 포워딩은 필요하지 않다. 서로 신뢰할 수 없는 네트워크를 통과한다면 HTTPS를 사용한다.

## 실물 NFC 점검

ACR1252는 PC/SC에서 PICC와 SAM 슬롯이 따로 보인다. 미러 코드는 **PICC만 카드 리더로 사용**하며 SAM은 역할 배정에서 제외한다. Windows Smart Card 서비스와 리더 드라이버, `pyscard`가 필요하다. 이 PC에서는 ACR1252 PICC와 SAM 열거를 확인했다.

다음 명령은 등록·인쇄 없이 현재 설정과 리더, 실행 중인 미러 서버, 프린터 인증 경로를 확인한다.

```powershell
.\poc\backend\.venv\Scripts\python.exe .\scripts\idprinter-link.py check
```

선택적으로 `--card-uid <실제UID>`를 주면 해당 카드가 프린터에서 현재 방문자에게 발급됐는지도 확인한다. 기본 점검의 `UNKNOWN_CARD`는 존재하지 않는 점검 UID에 대한 정상 응답으로, 서버 간 인증이 통과했다는 의미다. 미러의 `/api/nfc/status`는 로컬 또는 기존 운영자 인증으로만 접근할 수 있다. 카드 UID와 토큰을 응답하지 않는다.

`check` 통과는 미러 → 프린터 인증과 로컬 리더 상태의 확인이다. **프린터 → 미러 리포트 조회와 실제 종이 출력은 다음 순서로 별도 확인**한다.

1. 프린터에서 테스트 방문자의 사원증을 발급한다. 단순 UID 메모나 미러의 로컬 카드 발급만으로 대체하지 않는다.
2. 미러 대기 화면이 열린 뒤 카드를 태그한다. 첫 폴링은 이전 태그를 버리므로, 화면을 열기 전부터 올려둔 카드는 뗐다가 다시 태그한다.
3. 미발급 카드도 태그하면 별도 발급 안내 없이 익명 체험 준비와 대화로 넘어가는지 확인한다. 사원증 서버 조회가 실패해도 같은 방식으로 체험을 시작한다. 이때 UID나 이전 방문자의 사원증 방문 회차를 새 세션에 전달하면 안 된다. 출력 연결을 검증할 때는 정상 발급 카드와 정상 서버 연결을 사용한다.
4. 대화 후 리포트가 완료될 때까지 기다린다. `사원증 결과 연결을 기다리고 있어요`가 보이면 네트워크 복구 후 **사원증 연결 다시 시도**를 누른다. 같은 체험 세션을 연결하므로 새 세션을 만들 필요가 없다.
5. `리포트가 준비됐어요` 안내를 확인하고 출력 키오스크에 같은 카드를 태그한다. 분석 전에는 `REPORT_PENDING`, 완료 후에는 실제 리포트가 보여야 한다.
6. 프린터의 `KIOSK_PRINT=screen`은 미리보기이므로 종이가 나오지 않는다. 현장에서 검증한 ESC/POS 또는 CUPS 설정을 적용하고 한 장 출력한다. `submitted`는 전송 상태이며 실제 종이 배출·커터 동작은 눈으로 확인한다.
7. 동일 출력 요청의 반복이 새 인쇄를 만들지 않는지 확인한다. 카드 재발급 후 이전 체험 재연결은 충돌로 거부되어야 한다.

## 연결 계약과 검증 범위

미러는 프린터의 카드 UID와 방문 회차(`MW…`)를 확인한 뒤 정수 미러 세션 ID와 세션 접근 토큰을 서버 간에 연결한다. 프린터는 보관한 세션 토큰으로 미러의 `/api/sessions/{id}/progress`와 `/report`를 조회한다. 서로 다른 두 세션 ID를 혼용하지 않는다. 카드 재사용 중 늦게 도착한 연결은 원래 회차와 일치하지 않으면 거부한다.

검증 명령:

```powershell
# 미러 백엔드: 별도 테스트 DB 사용
cd poc/backend
.\.venv\Scripts\python.exe -m pytest tests/test_idprinter_bridge.py tests/test_idprinter_kiosk_flow.py tests/test_nfc_reader.py tests/test_idprinter_setup.py -q

# 실제 프린터 저장소 코드까지 사용하는 선택적 통합 검증
$env:IDPRINTER_SOURCE='프린터 저장소의 절대 경로'
.\.venv\Scripts\python.exe -m pytest tests/test_idprinter_integration.py -q

# 미러 프런트엔드
cd ../../mvp
node --test --test-force-exit src/lib/nfc.test.js src/lib/pocApi.test.js src/lib/kioskBridge.browser.test.js src/lib/mirrorPrinterLink.browser.test.js
```

선택적 통합 검증에는 프린터 코드가 사용하는 OpenCV·Pillow와 한글 폰트가 필요하다. 테스트는 외부 AI·실물 UID 읽기·물리 인쇄를 대체하고, 양쪽 실제 API·SQLite 연결·분석 리포트 정규화·576도트 감열 이미지 렌더·중복 요청 방지·카드 재발급 충돌을 검증한다. 실제 장비의 드라이버·용지·커터 검증은 포함하지 않는다.
