/** PIPA 음성 수집 동의 안내 (S-B2B-108·S-B2B-109, D-14).
 *
 * 문구는 docs/plan/b2b/consent-copy.md의 "화면용 단문"과 "전문"을 그대로 쓴다 —
 * 구현이 바뀌면 문구 문서를 먼저 바꾼다(문서 §0 원칙). 특히 음성 수집 동의의
 * "(필수 아님)" 표기는 지우지 않는다 — 거부 가능성이 화면에서 보여야 한다.
 *
 * 체크박스 3개:
 *  - 안내 확인(필수): 가입 버튼을 여는 게이트 — 동의 강제가 아니라 고지 확인.
 *  - 음성 수집 동의(필수 아님): 거부해도 텍스트 입력으로 동일 참여 가능.
 *  - 계정 저장 동의(선택): 음성 수집에 동의한 경우에만 활성(S-CBYKOH 계승).
 *
 * 동의 일시·버전 기록 저장은 백엔드 계약 확정 전(S-B2B-108 남은 일) —
 * 이 컴포넌트는 화면 고지와 게이트만 담당한다.
 */

export interface ConsentState {
  /** (필수) 개인정보 수집·이용 안내를 확인했다 — 가입 게이트 */
  confirmed: boolean;
  /** (필수 아님) 음성 수집 동의 — 거부 시 텍스트 입력으로 참여 */
  voice: boolean;
  /** (선택) 계정에 음성 저장 동의 — voice 동의 시에만 유효 */
  storage: boolean;
}

export const EMPTY_CONSENT: ConsentState = { confirmed: false, voice: false, storage: false };

interface Props {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
}

export default function ConsentNotice({ value, onChange }: Props) {
  return (
    <section className="consent-box">
      <h2>음성 수집 동의</h2>
      <p className="consent-copy">
        교육 평가와 코칭 리포트를 만들기 위해 <strong>음성 녹음, 발화 텍스트, 비언어 집계
        지표</strong>(숫자 요약)를 수집합니다.
        <br />
        <strong>카메라 영상 원본은 저장·전송되지 않습니다.</strong> 분석은 이 기기 안에서
        이루어집니다.
      </p>
      <ul className="consent-list">
        <li>보관: 기본 <strong>7일</strong> 후 자동 삭제 (계정에 저장을 선택하면 교육 과정 종료 후 30일)</li>
        <li>제3자 제공: <strong>없음</strong> (외부 서버·클라우드로 보내지 않습니다)</li>
        <li>삭제 요청: 언제든 교육 담당자 또는 안내된 경로로 즉시 삭제를 요청할 수 있습니다</li>
      </ul>
      <p className="consent-copy">
        동의하지 않아도 불이익은 없으며, <strong>텍스트 입력 방식</strong>으로 동일하게 참여할
        수 있습니다.
      </p>

      <label className="consent-check">
        <input
          type="checkbox"
          checked={value.voice}
          onChange={(e) =>
            onChange({
              ...value,
              voice: e.target.checked,
              // 수집 동의 철회 시 저장 동의도 함께 해제 (저장은 수집의 하위 동의)
              storage: e.target.checked ? value.storage : false,
            })
          }
        />
        <span>(필수 아님) 음성 수집에 동의합니다</span>
      </label>
      <label className={`consent-check ${value.voice ? '' : 'disabled'}`}>
        <input
          type="checkbox"
          checked={value.storage}
          disabled={!value.voice}
          onChange={(e) => onChange({ ...value, storage: e.target.checked })}
        />
        <span>
          (선택) 내 계정에 결과와 함께 음성을 저장하는 것에 동의합니다 — 교육 과정 종료 후
          30일 보관
        </span>
      </label>

      <details className="consent-full">
        <summary>전문 보기 — 음성 등 개인정보 수집·이용 동의서</summary>
        <div className="consent-full-body">
          <p>
            ㈜(운영 주체명 기입) — 이하 &quot;운영자&quot; — 는 「개인정보 보호법」에 따라
            아래와 같이 개인정보를 수집·이용하고자 합니다. 내용을 확인하신 후 동의 여부를
            결정해 주시기 바랍니다.
          </p>
          <h3>1. 수집 항목</h3>
          <ul>
            <li>음성 녹음 파일(롤플레이 중 수강생 발화)</li>
            <li>발화 전사 텍스트(음성을 문자로 변환한 기록)</li>
            <li>비언어 집계 지표(시선·자세·표정에 대한 수치 요약값)</li>
          </ul>
          <p>
            ※ <strong>카메라 영상 원본은 수집하지 않습니다.</strong> 영상 분석은 훈련 기기
            내부에서만 수행되며, 결과 숫자(집계 지표)만 저장됩니다.
          </p>
          <h3>2. 수집·이용 목적</h3>
          <ul>
            <li>교육 평가(응대·보고 역량 분석) 및 코칭 리포트 생성</li>
            <li>회차 간 개선 추이 확인(계정 저장 동의자에 한함)</li>
          </ul>
          <h3>3. 보관 및 이용 기간</h3>
          <ul>
            <li>음성 녹음 파일: 수집일로부터 <strong>7일</strong> 후 자동 삭제</li>
            <li>계정 저장에 별도 동의한 경우: <strong>소속 교육 과정 종료 후 30일</strong>까지 보관 후 삭제</li>
            <li>음성 수집에 동의하였으나 저장에 동의하지 않은 경우: 분석 완료 직후 삭제</li>
            <li>전사 텍스트·집계 지표: 코칭 리포트 제공 목적 범위에서 위 기간에 준하여 보관</li>
          </ul>
          <h3>4. 삭제 요청</h3>
          <p>
            정보주체는 언제든지 본인의 음성·전사·지표 데이터의 즉시 삭제를 요청할 수
            있습니다. 요청 경로: 소속 기관 교육 담당자 또는 화면에 안내된 운영자 연락처.
            요청 접수 시 지체 없이 삭제합니다.
          </p>
          <h3>5. 제3자 제공 및 처리 위탁</h3>
          <p>
            수집된 정보는 제3자에게 제공하지 않습니다. 음성·영상 처리는 외부 클라우드
            서비스로 전송되지 않고 훈련 기기 및 운영 서버 내부에서만 이루어집니다.
          </p>
          <h3>6. 동의 거부 권리 및 불이익</h3>
          <p>
            정보주체는 동의를 거부할 권리가 있으며, 동의하지 않아도 교육 참여에 불이익이
            없습니다. 이 경우 음성 대신 <strong>텍스트 입력 방식</strong>으로 동일한 교육에
            참여할 수 있습니다(음성 관련 지표는 측정에서 제외됩니다).
          </p>
          <h3>7. 14세 미만 아동</h3>
          <p>
            본 서비스는 기업·기관 소속 수강생(성인)을 대상으로 하며, 14세 미만 아동의
            개인정보를 수집하지 않습니다. 14세 미만임이 확인되는 경우 수집을 중단하고 기존
            수집분을 삭제합니다.
          </p>
        </div>
      </details>

      <label className="consent-check consent-required">
        <input
          type="checkbox"
          checked={value.confirmed}
          onChange={(e) => onChange({ ...value, confirmed: e.target.checked })}
        />
        <span>(필수) 위 개인정보 수집·이용 안내를 확인했습니다</span>
      </label>
    </section>
  );
}
