# 전산업무 포털

GitHub Pages로 올려 쓰는 업무용 HTML 도구 모음입니다. 빌드 과정 없이 파일만 추가하면 됩니다.
헤더(상단 메뉴) · 좌측 메뉴 · 경로 표시 · 도구 검색 · 다크 모드는 모든 페이지에 자동으로 붙습니다.

## 폴더 구조

```
(저장소 루트)
├─ index.html              홈 (도구 카드 목록 + 검색)
├─ _template.html          새 도구 만들 때 복사할 템플릿
├─ assets/
│  ├─ menu.js              ★ 메뉴 설정 — 도구 추가 시 여기만 수정
│  ├─ layout.js            공통 헤더/메뉴 자동 생성 + 유틸(복사, 입력값 저장, SQL 하이라이트)
│  └─ portal.css           공통 스타일
└─ db/                     카테고리 폴더 (카테고리 1개 = 폴더 1개)
   ├─ merge-deleted.html   삭제건 복구 MERGE 생성
   └─ in-clause.html       IN절 생성기
```

주소는 `https://<아이디>.github.io/<저장소명>/db/merge-deleted.html` 형태가 됩니다.
모든 경로가 상대경로라 저장소 이름이 무엇이든 동작하고, PC에서 파일을 더블클릭해 열어도 동작합니다.

## 새 도구 추가하기

1. `_template.html`을 카테고리 폴더에 복사 → 예: `db/table-diff.html`
2. `assets/menu.js`의 해당 카테고리 `items`에 한 줄 추가

   ```js
   { file: 'db/table-diff.html', name: '테이블 비교', desc: '두 테이블 구조 차이를 비교합니다.', tags: ['diff'] }
   ```
3. 커밋·푸시하면 끝. 상단 메뉴·좌측 메뉴·홈 카드·검색에 자동으로 나타납니다.

새 **카테고리**는 `menu.js`의 `categories`에 `{ id, name, desc, items: [...] }`를 추가하고 같은 이름의 폴더를 만드세요.

## 페이지에서 쓸 수 있는 공통 기능 (`window.Portal`)

| 함수 | 설명 |
|---|---|
| `Portal.persist(formEl)` | 폼 안의 `id` 있는 입력칸을 브라우저에 자동 저장·복원 |
| `Portal.copy(text, btn)` | 클립보드 복사 + 버튼에 "복사됨" 표시 |
| `Portal.highlightSql(sql)` | `<pre class="code">`에 넣을 하이라이트 HTML |
| `Portal.store.get/set(k, v)` | 페이지별 localStorage 저장 |
| `Portal.esc(s)` | HTML 이스케이프 |

자주 쓰는 CSS 클래스: `card`, `card-title`, `step`, `grid c2/c3/c4`, `field`, `hint`, `btn primary/sm`, `seg`, `check`, `msg err/ok`, `code-wrap` + `pre.code`, `table.data`.

## GitHub Pages 배포

1. 이 폴더 내용을 저장소 루트에 올립니다.
2. 저장소 **Settings → Pages → Build and deployment** 에서 Source: *Deploy from a branch*, Branch: `main` / `(root)` 선택.
3. 1~2분 뒤 `https://<아이디>.github.io/<저장소명>/` 접속.

> 입력한 테이블명·쿼리는 브라우저 안에서만 처리되고 어디로도 전송되지 않습니다.
> 단, 공개 저장소면 **페이지 소스(도구 코드)** 는 누구나 볼 수 있으니 회사 고유 테이블명·예시 데이터를 코드에 하드코딩하지 마세요.

---

## 도구: 삭제건 복구 MERGE 생성

로그 테이블(`CRUD` 컬럼에 C/U/D 기록)에서 기간 내 삭제된 레코드를 찾아 원본에 되살리는 쿼리를 만듭니다.

- **입력**: CREATE TABLE 문 또는 컬럼 목록(DB 툴/엑셀 복사) → 컬럼·PK 자동 인식, 체크박스로 조정
- **기간**: `이후`(시작 일시 이상) / `사이`(시작 이상 ~ 종료 이하). 로그 일시가 DATE형인지 문자열(14/8자리)인지 선택
- **사전 작업**: 원본 백업(구조+데이터) / 구조만 복사한 새 테이블에 적재 / 복사 없음
- **최종 이력이 D인 건만**: 삭제 후 다시 등록된 키는 제외 (PK별 최신 로그 1건이 D일 때만 대상)
- **출력 순서**: ① 대상 건수·목록 확인 → ② 테이블 복사 → ③ MERGE → ④ 누락 검증 쿼리
- **DBMS별 문법**: Oracle / SQL Server / PostgreSQL 15+ (MERGE), MySQL 8+ (`INSERT … SELECT … NOT EXISTS` 또는 `ON DUPLICATE KEY UPDATE`)
