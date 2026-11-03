#!/bin/sh
# 使いかた: .orchestra/status.sh <issue 番号> <状態> [見積もり(時間)] [期限 YYYY-MM-DD]
# 状態: 起票 | 着手可 | 作業 | レビュー | 確認待ち | 完了
# GitHub Project (calliope-pro の #4) のフィールドを更新する。issue が Project に無ければ足す。
set -e
OWNER=calliope-pro; REPO=kessan-8; PN=4
PROJECT=PVT_kwHOA9USUc4Bp_8Z
STATUS_FIELD=PVTSSF_lAHOA9USUc4Bp_8ZzhoY98E
ESTIMATE_FIELD=PVTF_lAHOA9USUc4Bp_8ZzhoY-D0
DUE_FIELD=PVTF_lAHOA9USUc4Bp_8ZzhoY-Es
case "$2" in
  起票) OPT=1475ee38;; 着手可) OPT=e8597260;; 作業) OPT=55ac7213;;
  レビュー) OPT=1960a17c;; 確認待ち) OPT=f828adf5;; 完了) OPT=876222c7;;
  *) echo "unknown status: $2" >&2; exit 1;;
esac
ITEM=$(gh project item-add $PN --owner $OWNER --url "https://github.com/$OWNER/$REPO/issues/$1" --format json --jq .id 2>/dev/null || \
  gh project item-list $PN --owner $OWNER --limit 500 --format json --jq ".items[]|select(.content.number==$1)|.id")
gh project item-edit --project-id $PROJECT --id "$ITEM" --field-id $STATUS_FIELD --single-select-option-id $OPT >/dev/null
[ -n "$3" ] && gh project item-edit --project-id $PROJECT --id "$ITEM" --field-id $ESTIMATE_FIELD --number "$3" >/dev/null
[ -n "$4" ] && gh project item-edit --project-id $PROJECT --id "$ITEM" --field-id $DUE_FIELD --date "$4" >/dev/null
echo "#$1 -> $2"
