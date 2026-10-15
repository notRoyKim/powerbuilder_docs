/*
 * 메뉴 설정 파일 — 새 도구를 만들면 여기에만 등록하면 됩니다.
 *
 *  categories[]  : 상단 GNB 탭 / 좌측 메뉴의 1뎁스 (폴더 하나 = 카테고리 하나 권장)
 *    items[]     : 2뎁스 도구
 *      file      : 사이트 루트 기준 경로 (예: 'db/merge-deleted.html')
 *      name      : 메뉴·제목에 표시될 이름
 *      desc      : 페이지 상단 설명 / 홈 카드 설명
 *      tags      : 검색용 키워드 (선택)
 */
window.PORTAL_MENU = {
  title: '전산업무 포털',
  subtitle: '자주 쓰는 SQL·데이터 작업 도구 모음',
  categories: [
    {
      id: 'db',
      name: 'DB 도구',
      desc: '쿼리 생성 · 테이블 작업',
      items: [
        {
          file: 'db/merge-deleted.html',
          name: '삭제건 복구 MERGE 생성',
          desc: '테이블 구조를 붙여넣고, 로그 테이블에서 기간 내 삭제(CRUD=D)된 레코드를 원본에 되살리는 MERGE 쿼리를 만듭니다.',
          tags: ['merge', 'log', '로그', '삭제', '복구', 'crud', '백업', '구조복사']
        },
        {
          file: 'db/in-clause.html',
          name: 'IN절 생성기',
          desc: '엑셀·메모장에서 복사한 값 목록을 IN (\'a\',\'b\', …) 조건으로 바꿉니다. 1000건 단위 분할 지원.',
          tags: ['in', 'where', '조건', '엑셀', '목록']
        },
        {
          file: 'db/sql-mask.html',
          name: '쿼리 컬럼명 추상화',
          desc: '쿼리의 테이블·컬럼명을 TB_01, COL_01 같은 이름으로 바꿔 외부에 보여줄 수 있게 하고, 받은 답변을 다시 원래 이름으로 복원합니다. 바꿀 이름은 직접 고칠 수 있습니다.',
          tags: ['추상화', '난독화', '마스킹', 'mask', 'obfuscate', '컬럼', '테이블', '복원', 'ai', '익명화']
        },
        {
          file: 'db/sql-rename.html',
          name: '쿼리 이름 바꾸기',
          desc: 'AI 등에서 받은 쿼리의 임시 테이블·컬럼명을 실제 이름으로 바꿉니다. 쿼리를 붙여넣고 표에 실제 이름만 입력하면 되고, 입력한 이름은 다음에 자동으로 채워집니다.',
          tags: ['이름', '바꾸기', '치환', 'rename', 'replace', '컬럼', '테이블', 'ai', '임시']
        }
      ]
    },
    {
      id: 'auto',
      name: '자동화',
      desc: '배치파일 · 스크립트 조립',
      items: [
        {
          file: 'auto/batch-builder.html',
          name: '배치파일 블록 조립기',
          desc: '스크래치처럼 블록을 클릭·드래그로 쌓아서 Windows 배치파일(.bat)을 만듭니다. 폴더 정리, 파일 백업, 반복 실행 같은 작업을 코드 없이 조립할 수 있습니다.',
          tags: ['batch', 'bat', '스크래치', 'scratch', '블록', '자동화', '스크립트', 'cmd']
        }
      ]
    },
    {
      id: 'etc',
      name: '기타 업무',
      desc: '이미지 · 기타 반복 작업',
      items: [
        {
          file: 'etc/image-eraser.html',
          name: '이미지 지우개',
          desc: '이미지에서 필요 없는 부분을 AI 클릭 선택이나 브러시로 고르면 주변과 어울리게 지워 줍니다. 모든 처리는 브라우저 안에서만 합니다.',
          tags: ['이미지', '지우개', '사진', '인페인팅', 'inpaint', 'AI', '마스킹', 'mask', '물체 제거', '워터마크']
        },
        {
          file: 'etc/bg-eraser.html',
          name: '배경 지우개',
          desc: '사진·도장·서명·로고의 배경을 투명하게 지워 PNG로 저장합니다. AI로 남길 물체를 클릭하거나 바탕색을 클릭해 지우고, 브러시로 다듬습니다. 모든 처리는 브라우저 안에서만 합니다.',
          tags: ['배경', '투명', '누끼', 'png', '도장', '직인', '서명', '로고', 'background', 'remove', 'AI']
        }
      ]
    }
    /*
    , {
      id: 'text',
      name: '텍스트 도구',
      desc: '변환 · 비교',
      items: [
        { file: 'text/diff.html', name: '텍스트 비교', desc: '...', tags: [] }
      ]
    }
    */
  ]
};
