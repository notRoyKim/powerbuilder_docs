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
