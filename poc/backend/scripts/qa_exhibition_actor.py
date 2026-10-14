"""합성 상대역 QA. 기본은 입력 미리보기이며 --live에서만 실제 AI를 호출한다.

결과의 목적 유지·사실성·반복·공개 범위는 expect와 대조해 사람이 검토한다.
대사 교체, 재작성, 성공으로 나올 때까지 재시도하는 로직은 없다.
"""
import argparse
import json
import sys
from pathlib import Path
from types import SimpleNamespace as NS

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', help='설정된 Gemini에 합성 입력 전송')
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    from app.services.dialogue.gemini_provider import GeminiDialogueProvider
    from app.services.dialogue.openai_provider import _actor_prompt
    from app.services.workplace import EXHIBITION_SCENES

    cases = json.loads((BACKEND / 'tests/fixtures/exhibition_actor_qa.json').read_text())
    provider = GeminiDialogueProvider()
    results = []
    for case in cases:
        scene = next(scene for scene in EXHIBITION_SCENES if scene['order'] == case['order'])
        turns = [NS(question_text=q, response_text=a, character_id='park_senior',
                    episode_id=scene['order']) for q, a in case['history']]
        turns.append(NS(question_text=case['history'][-1][0] if case['history'] else scene['opening_line'],
                        response_text=case['answer'], character_id='park_senior', episode_id=scene['order']))
        item = {**scene, 'episode_id':scene['order'], 'text':scene['opening_line']}
        session, scenario, character = NS(difficulty='basic'), NS(world_setting={}), {'id':'park_senior'}
        prompt = _actor_prompt(session, scenario, character, turns, item)
        row = {'case':case['id'], 'input':case['answer'], 'expect':case['expect'], 'prompt':prompt}
        if args.live:
            row['actor'] = provider._generate_continuous_line(session, scenario, character, turns, {}, item)
        results.append(row)
        args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2))
        print(case['id'], 'generated' if args.live else 'preview')


if __name__ == '__main__':
    main()
