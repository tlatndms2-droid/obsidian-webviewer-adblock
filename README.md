# Webviewer Adblock

Obsidian 기본 웹뷰어에 광고·추적 요청 차단과 광고 영역 숨김을 추가하는 데스크톱 플러그인입니다. Stands와 별개로 동작하며 Stands 코드를 사용하지 않습니다.

## 설치

BRAT의 **Add beta plugin**에서 `tlatndms2-droid/obsidian-webviewer-adblock`을 추가합니다. Obsidian의 **설정 → 코어 플러그인 → 웹 뷰어**를 켜고, **커뮤니티 플러그인 → Webviewer Adblock**을 켜세요. 수동 설치는 Release의 `main.js`, `manifest.json`, `styles.css`를 볼트의 `.obsidian/plugins/webviewer-adblock/`에 넣습니다.

## 사용

- 기본 웹뷰어에서 웹사이트를 열면 추가 차단이 적용됩니다. 설치 전에 열어 둔 페이지는 새로고침하세요.
- 웹뷰어 오른쪽 위 방패 버튼: 현재 사이트의 추가 차단을 해제하거나 다시 켭니다. 제외는 하위 도메인에도 적용됩니다. 이미 차단된 요청을 다시 불러오려면 새로고침하세요.
- **YouTube 자동 차단:** 첫 재생과 같은 탭에서 다른 영상으로 넘어갈 때도 자동 적용됩니다. 방패 버튼을 영상마다 누르지 마세요. 방패는 차단 해제/재활성화용입니다. 업데이트 직후 이미 열린 YouTube 탭은 한 번 새로고침하세요. 이전에 YouTube를 제외했다면 설정의 제외 목록에서 해당 도메인을 지워야 자동 차단이 적용됩니다.
- 왼쪽 리본의 방패 또는 하단 **웹 광고 차단** 표시: 한국어 설정을 엽니다.
- **지금 업데이트**: EasyList, EasyPrivacy, List-KR 최신 목록을 내려받습니다. 자동 다운로드는 하지 않습니다. 실패하면 기존 필터로 계속 작동합니다.
- 하단 숫자는 이번 실행에서 추가로 차단한 요청과 광고 정보를 제거한 YouTube 재생 응답 수입니다. 기본 광고 차단이나 숨긴 배너 수는 포함하지 않습니다.

## 범위와 제한

Obsidian의 기본 차단 설정과 네트워크 처리기를 바꾸지 않습니다. 기본 웹뷰어 탭에만 추가로 적용하며 일반 브라우저, Canvas 임베드, 다른 웹뷰어 플러그인을 대상으로 하지 않습니다. 제외 사이트에서도 Obsidian 자체 차단은 계속 적용됩니다.

네트워크 필터와 표준 CSS 숨김 필터를 적용합니다. YouTube에서는 페이지의 첫 스크립트보다 먼저 재생 응답의 광고 필드를 제거하고, 다음 영상의 player/next 응답에도 같은 처리를 적용합니다. 이미 재생 대기 중인 광고에는 건너뛰기 처리를 보조 적용합니다. 본문 영상의 스트림·자막은 보존하며 재생 음량·음소거 설정을 바꾸지 않습니다. YouTube의 광고 전달 방식이 바뀌면 추가 수정이 필요할 수 있습니다.

필터 목록의 고급 스크립틀릿, HTML 필터, 고급 절차형 선택자, WebSocket 연결 및 팝업 창 차단은 지원 범위에 포함하지 않습니다. 광고 프레임의 네트워크 요청은 검사하지만 하위 프레임 내부의 CSS 숨김은 적용하지 않습니다. Stands나 uBlock Origin과 동일한 결과를 보장하지 않습니다.

개발자 도구나 다른 디버거가 사용 중인 탭은 추가 차단 연결이 제한됩니다. 기본 차단은 유지됩니다. 개발자 도구를 닫으면 최대 약 30초 안에 재연결을 시도합니다. 새로고침이 필요할 수 있습니다.

Obsidian의 비공개 웹뷰어 연결 기능과 Electron 디버거 API를 사용하므로 Obsidian 업데이트 후 호환성 확인이 필요합니다. 실제 검증 환경: Windows, Obsidian 1.12.7 및 1.14.5. 최종 빌드의 기능·재시작 확인은 1.14.5에서 수행했습니다.

방문 기록·쿠키·페이지 내용을 수집하거나 외부로 전송하는 코드는 없습니다. 필터 업데이트 때 공개 필터 서버에만 접속합니다. 기본 필터가 번들에 포함되어 오프라인에서도 차단할 수 있습니다. 업데이트 캐시는 플러그인 폴더의 `filters.bin`, 설정은 `data.json`에 저장합니다. 페이지 요청은 웹뷰어 내부에서 검사하며 필터가 일치하는 요청을 중단합니다.

## 개발과 검증

Node.js 22 이상에서 `npm ci`, `npm run check`, `npm test`, `npm run build`를 실행합니다. 필터 재생성은 `node scripts/prepare-filters.mjs`입니다. 원본 필터는 `filters/`, 해당 목록에서 생성한 번들 엔진은 `src/generated/engine.json`에 있습니다.

실제 Sandbox 검증용 스크립트는 `scripts/fixture-server.mjs`, `scripts/validate-runtime.mjs`입니다. 후자는 이름에 `WebviewerAdblockSandbox`가 들어간 CDP 9367 대상에만 연결합니다. 실행 전에 격리 Sandbox를 준비하고 빌드를 설치해야 합니다. 사용자 볼트에는 실행하지 마세요.

## 라이선스

GPL-3.0-or-later. 포함된 엔진·필터·의존성의 출처와 라이선스는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt)를 참조하세요.
