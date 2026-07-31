/** 세션 클레임 (B-8 연동, S-B2B-111) — 영수증 QR로 받은 링크(/claim?token=…)로
 * 훈련 무대(카페 온도)에서 한 연습 결과를 내 계정에 귀속한다.
 * 흐름: 무인증 미리보기 → (미로그인 시 로그인/가입 유도) → POST 귀속 → 등급 표시.
 * 오류: 404 위조·만료 토큰, 409 타인 계정에 이미 귀속. */
import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { authToken, claimSession, previewClaim } from '../../api/client';
import type { SessionClaim } from '../../api/types';
import ondoLogo from '../../assets/brand/cafe-ondo-logo.svg';
import { GradeBadge } from '../../components/GradeBadge';
import { formatDateTime } from '../../lib/b2b';

export default function ClaimPage() {
  const location = useLocation();
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const [preview, setPreview] = useState<SessionClaim | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [claimed, setClaimed] = useState<SessionClaim | null>(null);
  const [claimError, setClaimError] = useState('');
  const [busy, setBusy] = useState(false);
  const loggedIn = Boolean(authToken());

  useEffect(() => {
    if (!token) {
      setPreviewError('링크에 토큰이 없어요. 영수증의 QR 코드를 다시 스캔해 주세요.');
      return;
    }
    previewClaim(token)
      .then(setPreview)
      .catch((e: unknown) => {
        if (isAxiosError(e) && e.response?.status === 404) {
          setPreviewError('유효하지 않거나 만료된 링크예요. 영수증의 QR 코드를 다시 확인해 주세요.');
        } else {
          setPreviewError('결과를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
      });
  }, [token]);

  async function claim() {
    setBusy(true);
    setClaimError('');
    try {
      setClaimed(await claimSession(token));
    } catch (e: unknown) {
      if (isAxiosError(e) && e.response?.status === 409) {
        setClaimError('이 결과는 이미 다른 계정에 담겨 있어요. 본인 결과가 맞는지 확인해 주세요.');
      } else if (isAxiosError(e) && e.response?.status === 404) {
        setClaimError('유효하지 않거나 만료된 링크예요. 영수증의 QR 코드를 다시 확인해 주세요.');
      } else {
        setClaimError('결과를 담지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setBusy(false);
    }
  }

  // 로그인/가입 후 이 화면으로 복귀하도록 next에 현재 경로를 실어 보낸다
  const nextQuery = `?next=${encodeURIComponent(`/claim?token=${token}`)}`;

  return (
    <div className="page claim">
      <div className="card claim-card">
        {/* 카페 온도 — 훈련 무대 브랜드 (연습이 일어난 무대를 알려주는 표식) */}
        <img src={ondoLogo} alt="카페 온도 — 한 잔의 온도를 지키는 사람들" className="claim-brand" />

        {previewError && <div className="error-banner">{previewError}</div>}
        {!preview && !previewError && <p className="section-sub">결과를 확인하는 중…</p>}

        {preview && claimed === null && (
          <>
            <h1>이 연습 결과를 내 계정에 담을까요?</h1>
            <dl className="claim-summary">
              <div>
                <dt>시나리오</dt>
                <dd>{preview.scenario_title || '—'}</dd>
              </div>
              <div>
                <dt>연습 일시</dt>
                <dd>{formatDateTime(preview.started_at)}</dd>
              </div>
              <div>
                <dt>등급</dt>
                <dd><GradeBadge grade={preview.grade} /></dd>
              </div>
            </dl>
            {preview.already_claimed && (
              <div className="notice">
                이미 계정에 담긴 결과예요. 내 계정에 담았다면 아래 버튼으로 다시 확인할 수
                있고, 다른 계정에 담긴 결과라면 담을 수 없어요.
              </div>
            )}
            {claimError && <div className="error-banner">{claimError}</div>}
            {loggedIn ? (
              <button className="primary-btn" onClick={claim} disabled={busy}>
                {busy ? '담는 중…' : '내 계정에 담기'}
              </button>
            ) : (
              <>
                <p className="section-sub">
                  결과를 계정에 담으려면 로그인이 필요해요. 처음이라면 가입하면서 초대
                  코드로 기관에 소속될 수 있습니다.
                </p>
                <div className="claim-auth-actions">
                  <Link className="primary-btn" to={`/login${nextQuery}`}>로그인</Link>
                  <Link className="ghost-btn" to={`/signup${nextQuery}`}>회원가입</Link>
                </div>
              </>
            )}
          </>
        )}

        {claimed && (
          <>
            <h1>결과를 내 계정에 담았어요</h1>
            {claimed.already_claimed && (
              <p className="section-sub">이미 담겨 있던 결과라 그대로 확인만 했어요.</p>
            )}
            <div className="claim-grade">
              <GradeBadge grade={claimed.grade} large />
            </div>
            <p className="section-sub">
              {claimed.scenario_title || '연습'} · {formatDateTime(claimed.started_at)}
            </p>
            <Link className="primary-btn" to="/me/results">내 결과 전체 보기</Link>
          </>
        )}
      </div>
    </div>
  );
}
