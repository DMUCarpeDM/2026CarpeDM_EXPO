import test from 'node:test';
import assert from 'node:assert/strict';
import {practiceSpeechOptions} from './practiceSpeechOptions.js';

test('opening speech uses the prepared ElevenLabs recording on any scene', () => {
  assert.deepEqual(practiceSpeechOptions('  준비된  질문 ', [{text:'준비된 질문',url:'/opening.wav',provider:'elevenlabs'}]), {
    voice:'female',serverTtsReady:true,allowBrowserFallback:false,expectedServerProvider:'elevenlabs',preparedAudioUrl:'/opening.wav',
  });
});
test('dynamic AI replies always request ElevenLabs without browser fallback', () => {
  const options=practiceSpeechOptions('새 AI 응답', [{text:'이전 대사',url:'/old.wav',provider:'elevenlabs'}]);
  assert.equal(options.preparedAudioUrl,undefined);
  assert.equal(options.voice,'female');
  assert.equal(options.serverTtsReady,true);
  assert.equal(options.allowBrowserFallback,false);
  assert.equal(options.expectedServerProvider,'elevenlabs');
});
test('a recording with no ElevenLabs provenance is not substituted', () => {
  assert.equal(practiceSpeechOptions('질문',[{text:'질문',url:'/unverified.wav'}]).preparedAudioUrl,undefined);
});
