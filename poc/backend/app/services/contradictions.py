"""채점과 확인 질문이 공유하는 모순 중복 식별자."""
import hashlib
import unicodedata


def normalize(value):
    return "".join(unicodedata.normalize("NFKC", value).split()).casefold()


def keys(evidence):
    result = set()
    fact = normalize(evidence.get("fact_key", ""))
    if fact:
        result.add("fact:" + fact)
    before, after = evidence.get("previous_quote"), evidence.get("quote")
    if before and after:
        # 같은 인용 쌍은 턴·항목명·인용 순서가 달라도 같은 사건이다.
        pair = sorted([normalize(before), normalize(after)])
        digest = hashlib.sha256(repr(pair).encode()).hexdigest()
        result.add("quotes:" + digest)
    return result


def confirmed_keys(values):
    # 이전 세션의 원문 항목명도 같은 정규화 규칙으로 읽는다.
    return {value if value.startswith(("fact:", "quotes:")) else "fact:" + normalize(value)
            for value in values}
