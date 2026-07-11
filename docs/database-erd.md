# 4-Fit 미러팅 — 데이터베이스 ERD

> **정본**: [`backend/app/models/models.py`](../backend/app/models/models.py). 이 문서는 거기서 파생된 시각화·참조표다.
> 설계 원칙·Phase B(기관 납품) 목표 스키마는 [`docs/database-design.md`](database-design.md)를 본다.
> 갱신: 2026-07-11 · 테이블 13개 · 외래키 16개

---

## 0. 표기법 (범례)

- 표기: Mermaid **crow's-foot**. `||--o{` = 1:N, `||--o|` = 1:0..1(선택적 1:1).
- 컬럼 태그: `PK` 기본키 · `FK` 외래키 · `UK` UNIQUE.
- 관계선 라벨 = **FK 컬럼 · ondelete 동작**(`CASCADE` 딸려 삭제 / `SET NULL` FK만 비움 / `NO ACTION` 삭제 차단).
- ⚠️ SQLite는 기본 FK **OFF**다. 모든 CASCADE/SET NULL은 [`core/database.py`](../backend/app/core/database.py)의 연결별 `PRAGMA foreign_keys=ON`이 켜 줄 때만 작동한다.

---

## 1. 전체 ERD (13 테이블)

```mermaid
erDiagram
    users ||--o{ roleplay_sessions : "user_id · SET NULL"
    users ||--o{ consents : "user_id · SET NULL"
    users ||--o{ audit_events : "user_id · SET NULL"
    scenarios ||--o{ episodes : "scenario_id · CASCADE"
    scenarios ||--o{ roleplay_sessions : "scenario_id · NO ACTION"
    roleplay_sessions ||--o{ consents : "session_id · CASCADE"
    roleplay_sessions ||--o{ turns : "session_id · CASCADE"
    roleplay_sessions ||--o{ analysis_results : "session_id · CASCADE"
    roleplay_sessions ||--o| reports : "session_id · 1:1 · CASCADE"
    roleplay_sessions ||--o| survey_responses : "session_id · 1:1 · CASCADE"
    episodes ||--o{ turns : "episode_id · CASCADE"
    turns ||--o{ analysis_results : "turn_id · CASCADE · NULL=세션레벨"
    institutions ||--o{ roleplay_sessions : "institution_id · Phase2"
    institutions ||--o{ devices : "institution_id · SET NULL"
    institutions ||--o{ anonymous_ids : "institution_id · SET NULL"
    devices ||--o{ roleplay_sessions : "device_id · Phase2"

    users {
        int id PK
        string email UK
        string password_hash
        string name
        string role "user | admin"
        datetime created_at
    }
    consents {
        int id PK
        int session_id FK "nullable"
        int user_id FK "nullable"
        string storage_policy "none|anonymous|account"
        bool agreed
        datetime agreed_at
    }
    scenarios {
        int id PK
        string slug UK
        string title
        text description
        json world_setting "company/service/situation"
        json characters "4인: id,name,role,tts"
        bool is_active
    }
    episodes {
        int id PK
        int scenario_id FK
        int order "UQ(scenario_id,order)"
        string title
        text situation
        string character_id "→characters[].id (논리)"
        json modes "[5,10]"
        text initial_question
        string virtual_time "예: 09:04"
        json intro_variants "high/low 분기"
        text question_intent
        json checklist "채점 항목"
        json pressure_questions
        json deepening_questions
        int max_turns
    }
    roleplay_sessions {
        int id PK
        int scenario_id FK
        int user_id FK "nullable"
        string client_key "익명 연속성 idx"
        string access_token "IDOR 차단"
        int institution_id FK "nullable Phase2"
        int device_id FK "nullable Phase2"
        int mode "5 | 10"
        string difficulty "basic|pressure"
        int attempt_no "회차 KPI"
        enum status "ready→…→completed/aborted"
        json analysis_progress
        json rapport "수행도 points/결말분기"
        datetime started_at
        datetime ended_at "nullable"
    }
    turns {
        int id PK
        int session_id FK
        int episode_id FK
        int order "UQ(session_id,order)"
        string question_type "initial|followup|pressure"
        text question_text
        string character_id
        text reaction_text "질문 前 상대 반응"
        string reaction_character_id
        text response_text
        string stt_source "webspeech|whisper|text"
        int response_duration_ms
        string audio_path
        json nonverbal_metrics "MediaPipe 집계(영상 無)"
        datetime asked_at
        datetime answered_at "nullable"
    }
    analysis_results {
        int id PK
        int session_id FK
        int turn_id FK "nullable=세션레벨"
        enum fit_type "response|voice|eye|posture"
        json raw_metrics
        float score "0~100"
        string engine_version "산식 버전"
        json evidence
        datetime created_at
    }
    reports {
        int id PK
        int session_id FK "UK 1:1"
        float total_score "백분위용 idx"
        string engine_version
        json fit_scores "4-Fit 점수/요약"
        json strengths
        json improvements
        json evidence_segments
        json headline "오늘의 한 문장"
        json rebuild "코치와 다시쓰기"
        json speech_stats
        json day_ending "하루의 결말"
        json deep_analysis "담화/압박내성/적응"
        int analysis_ms
        datetime created_at
    }
    survey_responses {
        int id PK
        int session_id FK "UK 1:1"
        int q_clarity "1~5"
        int q_empathy "1~5"
        int q_personalization "1~5"
        text comment
        datetime created_at
    }
    audit_events {
        int id PK
        int user_id FK "nullable"
        string action "reset|export_csv|…"
        json payload
        datetime created_at
    }
    institutions {
        int id PK
        string name
        string code UK
        datetime created_at
    }
    devices {
        int id PK
        int institution_id FK "nullable"
        string name
        datetime last_ping_at
        datetime last_reset_at
    }
    anonymous_ids {
        int id PK
        int institution_id FK "nullable"
        string code UK "체험 코드"
        string client_key UK
        datetime created_at
    }
```

---

## 2. 도메인별 상세 뷰

13개를 한 번에 보면 빽빽하니, 세 덩어리로 나눠 읽는다.

### 2-1. 콘텐츠 (정적 — 시드로 채워지는 세계관)

```mermaid
erDiagram
    scenarios ||--o{ episodes : "scenario_id · CASCADE"
    scenarios {
        int id PK
        string slug UK
        json world_setting "회사/서비스/상황"
        json characters "4인 인물 + TTS"
        bool is_active
    }
    episodes {
        int id PK
        int scenario_id FK
        int order "UQ(scenario_id,order)"
        string character_id "→ characters[].id"
        json checklist "채점 항목"
        json pressure_questions "압박"
        json deepening_questions "심화"
        json intro_variants "수행도 분기"
    }
```

`scenarios.characters`는 **JSON 배열**이라 별도 테이블이 아니다. `episodes.character_id`/`turns.character_id`는 그 배열의 `id`를 가리키는 **논리 참조**(6절).

### 2-2. 체험 파이프라인 (동적 — 한 번의 역할극이 남기는 것)

```mermaid
erDiagram
    roleplay_sessions ||--o{ turns : "CASCADE"
    roleplay_sessions ||--o{ analysis_results : "CASCADE"
    roleplay_sessions ||--o| reports : "1:1 CASCADE"
    roleplay_sessions ||--o| survey_responses : "1:1 CASCADE"
    turns ||--o{ analysis_results : "turn_id · NULL=세션레벨"
    roleplay_sessions {
        int id PK
        string client_key "익명 연속성"
        string access_token "IDOR 차단"
        enum status "세션 FSM"
        json rapport "수행도/결말 분기"
    }
    turns {
        int id PK
        int session_id FK
        int episode_id FK
        string question_type
        json nonverbal_metrics "MediaPipe 집계"
    }
    analysis_results {
        int id PK
        enum fit_type "4-Fit"
        float score "0~100"
        json evidence
    }
    reports {
        int id PK
        float total_score "백분위"
        json deep_analysis "심층 교차"
        json day_ending
    }
    survey_responses {
        int id PK
        int q_clarity "KPI 1~5"
    }
```

허브는 `roleplay_sessions`. 한 세션이 여러 `turns`를 낳고, 각 턴(또는 세션 전체)에 대해 4-Fit `analysis_results`가 쌓이며, 최종적으로 `reports` 1건과 `survey_responses` 1건으로 마감된다.

### 2-3. 운영·기관 확장 (사용자·동의·감사 + Phase 2 골격)

```mermaid
erDiagram
    users ||--o{ roleplay_sessions : "user_id · SET NULL"
    users ||--o{ consents : "SET NULL"
    users ||--o{ audit_events : "SET NULL"
    institutions ||--o{ devices : "SET NULL"
    institutions ||--o{ anonymous_ids : "SET NULL"
    institutions ||--o{ roleplay_sessions : "Phase2"
    devices ||--o{ roleplay_sessions : "Phase2"
    users {
        int id PK
        string email UK
        string role "user|admin"
    }
    consents {
        int id PK
        string storage_policy "none|anonymous|account"
    }
    audit_events {
        int id PK
        string action "reset|export_csv"
    }
    institutions {
        int id PK
        string code UK
    }
    devices {
        int id PK
        datetime last_ping_at
    }
    anonymous_ids {
        int id PK
        string code UK "체험 코드"
        string client_key UK
    }
```

`institutions`·`devices`와 세션의 `institution_id`/`device_id`는 지금 전시(단일 테넌트)에선 전부 `NULL`이다. 기관 납품(Phase B)에서 켤 자리만 미리 잡아둔 **전방 호환 골격**이며, nullable이라 [`_migrate_columns`](../backend/app/seed/run.py)가 기존 DB에 무손실로 추가한다.

---

## 3. 세션 상태 기계 (`roleplay_sessions.status`)

```mermaid
stateDiagram-v2
    [*] --> ready: 세션 생성
    ready --> in_progress: 역할극 진행
    in_progress --> analyzing: 마지막 턴 종료
    analyzing --> completed: 리포트 생성
    ready --> aborted: 중단·타임아웃
    in_progress --> aborted: 중단·타임아웃
    analyzing --> aborted: 분석 실패
    completed --> [*]
    aborted --> [*]
```

부분 인덱스 `ix_sessions_active`가 `ready`/`in_progress`/`analyzing` **활성 상태만** 색인한다 — 전시 1클릭 초기화가 활성 세션을 빠르게 훑기 위한 설계다.

---

## 4. 관계·삭제 전파 매트릭스

| 부모 | 자식 | FK 컬럼 | 관계 | ondelete | 의미 |
|---|---|---|---|---|---|
| users | roleplay_sessions | `user_id` | 1:N | SET NULL | 익명 체험은 `user_id` NULL |
| users | consents | `user_id` | 1:N | SET NULL | 계정 삭제해도 동의 이력 보존 |
| users | audit_events | `user_id` | 1:N | SET NULL | 무인증 운영 기간은 NULL |
| scenarios | episodes | `scenario_id` | 1:N | **CASCADE** | 시나리오 삭제 → 에피소드 제거 |
| scenarios | roleplay_sessions | `scenario_id` | 1:N | NO ACTION | 사용 중 시나리오 삭제 차단 |
| roleplay_sessions | consents | `session_id` | 1:N | **CASCADE** | |
| roleplay_sessions | turns | `session_id` | 1:N | **CASCADE** | |
| roleplay_sessions | analysis_results | `session_id` | 1:N | **CASCADE** | |
| roleplay_sessions | reports | `session_id` | 1:0..1 | **CASCADE** | UNIQUE(1:1) |
| roleplay_sessions | survey_responses | `session_id` | 1:0..1 | **CASCADE** | UNIQUE(1:1) |
| episodes | turns | `episode_id` | 1:N | **CASCADE** | 재시드 시 턴 정리 |
| turns | analysis_results | `turn_id` | 1:N | **CASCADE** | `turn_id` NULL = 세션 레벨 결과 |
| institutions | roleplay_sessions | `institution_id` | 1:N | NO ACTION | Phase 2 (현재 NULL) |
| institutions | devices | `institution_id` | 1:N | SET NULL | |
| institutions | anonymous_ids | `institution_id` | 1:N | SET NULL | |
| devices | roleplay_sessions | `device_id` | 1:N | NO ACTION | Phase 2 (현재 NULL) |

**전시 리셋의 핵심**: `roleplay_sessions` 한 행을 지우면 `consents`·`turns`·`analysis_results`·`reports`·`survey_responses`가 전부 CASCADE로 딸려 내려간다(단, `PRAGMA foreign_keys=ON` 전제).

---

## 5. 제약·인덱스 카탈로그

| 테이블 | UNIQUE | CHECK | INDEX |
|---|---|---|---|
| users | `email` | `role IN (user,admin)` | `email` |
| consents | — | `session_id OR user_id NOT NULL` · `storage_policy IN (none,anonymous,account)` | `session_id` |
| scenarios | `slug` | — | — |
| episodes | `(scenario_id, order)` | — | — |
| roleplay_sessions | — | `mode IN (5,10)` · `difficulty IN (basic,pressure)` · `attempt_no >= 1` | `(client_key, id)` · `client_key` · 부분:`status`(활성만) |
| turns | `(session_id, order)` | — | `episode_id` |
| analysis_results | `(session_id, turn_id, fit_type)` | — | **부분 UNIQUE** `(session_id, fit_type)` WHERE `turn_id IS NULL` |
| reports | `session_id` | — | `total_score` |
| survey_responses | `session_id` | `q_clarity/q_empathy/q_personalization BETWEEN 1 AND 5` | — |
| audit_events | — | — | — |
| institutions | `code` | — | — |
| devices | — | — | — |
| anonymous_ids | `code` · `client_key` | — | `code` · `client_key` |

> **부분 UNIQUE 트릭**(`analysis_results`): SQLite UNIQUE는 NULL을 서로 다른 값으로 취급하므로, 일반 유니크로는 세션 레벨 결과(`turn_id IS NULL`)의 중복을 못 막는다. 그래서 `turn_id IS NULL`에만 걸리는 부분 유니크 인덱스를 추가로 둔다.

---

## 6. 논리 참조 (FK 아님 — 앱 레벨에서만 연결)

| 출발 | 도착 | 매개 |
|---|---|---|
| `episodes.character_id`, `turns.character_id`, `turns.reaction_character_id` | `scenarios.characters[].id` | JSON 배열 원소 id (테이블 아님) |
| `anonymous_ids.client_key` ↔ `roleplay_sessions.client_key` | 익명 재방문 추이 이어붙이기 | 문자열 매칭(FK 아님) |
| `reports.day_ending.character_id` 등 JSON 내부 id | `scenarios.characters[].id` | JSON 페이로드 |

이 참조들은 외래키가 아니므로 DB가 무결성을 강제하지 않는다 — 시드/서비스 코드가 책임진다.

---

## 7. 스키마 관리 요약

- **마이그레이션 도구 없음**. FastAPI `lifespan` 시작 시 [`seed()`](../backend/app/seed/run.py)가 `Base.metadata.create_all()`(없는 테이블 생성) + 시나리오 시드(멱등)를 돈다.
- 경량 마이그레이션 [`_migrate_columns()`](../backend/app/seed/run.py): 살아있는 스키마 vs 모델 메타데이터를 비교해 **누락 컬럼만 `ALTER TABLE ADD COLUMN`**. 스칼라 기본값만 DDL로 옮기고 callable(dict/utcnow)은 NULL로 둔다(읽는 쪽 `or {}` 가드가 흡수).
- **한계**: 타입 변경·컬럼 삭제는 반영 안 됨 → `mirroting.db`(+`-wal`/`-shm`) 삭제 후 재기동해 재생성. 실사용 데이터가 쌓이면 Alembic 도입이 선행 조건.
- 연결별 PRAGMA: `foreign_keys=ON`(FK 강제) · `journal_mode=WAL` + `busy_timeout=5000`(스레드풀 잠금 회피).

---

## 8. 프라이버시·보안 불변식 (스키마에 박힌 것)

- **영상 원본 미저장** — `turns.nonverbal_metrics`에 MediaPipe 집계값(JSON)만.
- **동의 저장 정책** — `consents.storage_policy` = none(미저장)/anonymous(익명)/account(계정).
- **IDOR 차단** — `roleplay_sessions.access_token`으로 순차 id 열거 방어.
- **개인정보 없는 연속성** — `client_key` + `anonymous_ids.code`(체험 코드)로 이메일·이름 없이 재방문 추이 제공.
- **파괴적 행위 감사** — 초기화·CSV 내보내기 등은 `audit_events`에 기록.
