# Mirror-Ting 스마트 미러 화면 실행 절차

Git과 Node.js 20 이상(npm 포함)이 설치된 컴퓨터에서 진행합니다.

## 1. 저장소 받기

```bash
git clone -b g-vallery https://github.com/DMUCarpeDM/2026CarpeDM_EXPO.git
cd 2026CarpeDM_EXPO/mvp
```

이미 받은 저장소라면 아래처럼 브랜치를 바꾸고 업데이트합니다.

```bash
git switch g-vallery
git pull
cd mvp
```

## 2. 패키지 설치

```bash
npm ci
```

처음 실행하거나 업데이트한 뒤에 한 번 실행합니다. 설치에는 인터넷이 필요합니다.

## 3. 개발 서버 실행

```bash
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

서버 터미널은 닫지 말고 열어 둡니다.

## 4. 스마트 미러 화면 열기

Chrome에서 아래 주소로 접속합니다.

**[http://127.0.0.1:5175/?service=workplace&mirror=1](http://127.0.0.1:5175/?service=workplace&mirror=1)**

- 미러 화면은 반드시 이 주소로 접속해야 열립니다. `?service=workplace&mirror=1`이 빠지면 일반 웹 화면이 나옵니다.
- 카메라·마이크 권한 요청이 뜨면 허용합니다.
- 화면을 누르면 시나리오 미리보기(출근·업무·퇴근)가 진행됩니다. 이어서 "대화를 준비하고 있어요" 화면이 약 3초 뜬 뒤 첫 AI 아바타 대기 화면으로 돌아갑니다.
