"""전체 메뉴 대신 세 가지 주문만 준비한다. 가격·결제·제조는 평가하지 않는다."""
from copy import deepcopy

VERSION = "cafe-orders-2026-09-16-v1"
ORDERS = {
    "basic": {"lines": [{"id": "drink-1", "drink": "아메리카노", "quantity": "1잔", "temperature": "아이스", "size": "기본", "options": "없음"}], "dining": "포장"},
    "pressure": {"lines": [
        {"id": "drink-1", "drink": "아메리카노", "quantity": "1잔", "temperature": "아이스", "size": "기본", "options": "없음"},
        {"id": "drink-2", "drink": "라테", "quantity": "1잔", "temperature": "따뜻하게", "size": "큰 크기", "options": "샷 1개 추가"}], "dining": "매장"},
    "ultra_pressure": {"lines": [
        {"id": "drink-1", "drink": "아메리카노", "quantity": "1잔", "temperature": "아이스", "size": "큰 크기", "options": "샷 1개 추가"},
        {"id": "drink-2", "drink": "라테", "quantity": "1잔", "temperature": "따뜻하게", "size": "기본", "options": "두유로 변경"},
        {"id": "drink-3", "drink": "바닐라 라테", "quantity": "1잔", "temperature": "아이스", "size": "기본", "options": "시럽 적게"},
        {"id": "drink-4", "drink": "카페모카", "quantity": "1잔", "temperature": "따뜻하게", "size": "큰 크기", "options": "휘핑 제외"}], "dining": "포장",
        "change": {"after_answers": 2, "field": "drink-2:temperature", "value": "아이스", "utterance": "두유로 바꾼 라테도 아이스로 바꿔 주세요."}},
}


def order_for(difficulty):
    return deepcopy(ORDERS[difficulty])


def fields(order):
    # 기본 크기·추가 옵션 없음까지 억지로 되묻도록 만들지 않는다.
    values = {f"{line['id']}:{key}": value for line in order["lines"] for key, value in line.items()
              if key != "id" and not (key == "size" and value == "기본") and not (key == "options" and value == "없음")}
    return {**values, "dining": order["dining"]}


def opening(order):
    drinks = [f"{line['temperature']} {line['drink']} {line['quantity']}, 크기는 {line['size']}, 옵션은 {line['options']}" for line in order["lines"]]
    return ". ".join(drinks) + " 주세요."


def pack():
    return {"slug": "cafe-order-taking", "title": "카페 주문받기", "description": "음료와 옵션, 포장·매장 이용 여부를 확인하고 마지막에 전체 주문을 다시 확인합니다.",
        "job_role": "cafe_crew", "domain": "service", "brand": "cafe-ondo",
        "rubric_weights": {"response": .25, "voice": .25, "expression": .25, "posture": .25},
        "world_setting": {"service_modes": ["training"], "user_role": "주문을 받는 신입 직원", "interaction": {"cafe_orders_version": VERSION}},
        "characters": [{"id": "customer", "name": "손님", "role": "손님", "role_key": "customer",
            "personality": "정해진 주문만 말한다. 어려움에서는 재촉할 수 있으나 욕설과 인신공격은 하지 않는다."}],
        "episodes": [{"order": 1, "title": "주문 접수와 최종 확인", "character_id": "customer", "initial_question": opening(ORDERS["basic"]),
            "situation": "가상 카페에서 손님의 주문을 받습니다. 결제와 제조는 제외합니다.", "question_intent": "주문 접수 완료 전 정확한 확인",
            "checklist": [{"id": "order", "label": "주문 확인", "keywords": ["아메리카노", "라테"], "paraphrases": ["주문하신 음료와 옵션을 다시 확인하겠습니다."], "followup": "주문과 이용 방식을 확인하고 전체 주문을 다시 확인해 주세요."}], "modes": [5, 10]}]}
