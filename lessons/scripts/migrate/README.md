# 형식 옮기기

명세 형식의 판(`schema_version`)을 올릴 때 옛 명세를 새 형식으로 고치는 스크립트를 여기에 둡니다. 지금은 첫 판(1)이라 스크립트가 없습니다.

판을 올리는 때와 순서는 `docs/CONTRACT.md` 18절에 있습니다. 스크립트를 쓸 때 지킬 것은 넷입니다.

1. 이름은 `v<N>-to-v<N+1>.mjs` 입니다. 예: `v1-to-v2.mjs`
2. YAML의 주석이 남도록 `yaml` 패키지의 `parseDocument` 로 고칩니다. `lib.mjs` 의 `specFiles()` 와 `rewrite()` 를 쓰면 `content/` 와 `tests/**/fixtures/` 의 명세를 빠짐없이 돕니다.
3. 칸 이름이나 값의 꼴만 바뀌면, 고치기 전에 `sealsOf(id)` 와 `reviewState(id)` 로 옛 지문과 그 지문에 맞던 기록을 적어 두고(옮기기 전의 코드로 돕니다), 옮긴 뒤에 그 기록의 `seal` 만 새 지문으로 바꿔 적습니다. 값의 뜻이 바뀌거나 필수 칸이 늘면 바꿔 적지 않고 다시 검수합니다.
4. 같은 PR에 `docs/CHANGELOG.md` 한 줄을 적습니다. 이 PR은 날쌤이 승인합니다.
