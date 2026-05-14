import { _ } from '../helper.js'

export default {
  // 平台名称
  platformNetease: _('网易云音乐', 'NetEase Music', '網易雲音樂', '网易云音乐', '네이버 클라우드 음악'),
  platformQQ: _('QQ音乐', 'QQ Music', 'QQ音樂', 'QQ音楽', 'QQ 음악'),
  platformKugou: _('酷狗音乐', 'Kugou Music', '酷狗音樂', 'ク gou 音楽', '쿤 gou 음악'),
  platformKuwo: _('酷我音乐', 'Kuwo Music', '酷我音樂', 'ク Wo 音楽', 'ク Wo 음악'),
  platformMigu: _('咪咕音乐', 'Migu Music', '咪咕音樂', 'ミ Go 音楽', '미 Go 음악'),

  // Tab
  tabDiscover: _('发现', 'Discover', '發現', '発見', '발견'),
  tabMy: _('我的', 'My', '我的', 'マイ', '마이'),

  // 搜索
  searchPlaceholder: _('搜索歌曲、歌手', 'Search songs or artists', '搜尋歌曲、歌手', '曲やアーティストを検索', '노래 또는 아티스트 검색'),
  searching: _('搜索中...', 'Searching...', '搜尋中...', '検索中...', '검색 중...'),
  noResults: _('没有找到结果', 'No results found', '沒有找到結果', '結果が見つかりません', '결과 없음'),

  // 推荐
  recTitle: _('推荐歌曲', 'Recommended', '推薦歌曲', 'おすすめ曲', '추천 노래'),

  // 播放
  nowPlaying: _('正在播放: {name} - {artist}', 'Now playing: {name} - {artist}', '正在播放: {name} - {artist}', '再生中: {name} - {artist}', '재생 중: {name} - {artist}'),
  playError: _('播放失败: {error}', 'Play error: {error}', '播放失敗: {error}', '再生エラー: {error}', '재생 오류: {error}'),
  playErrorToast: _('播放失败', 'Play error', '播放失敗', '再生エラー', '재생 오류'),

  // 歌曲操作
  togglePlay: _('播放/暂停', 'Play/Pause', '播放/暫停', '再生/一時停止', '재생/일시정지'),
  like: _('喜欢', 'Like', '喜歡', 'いいね', '좋아요'),
  addFav: _('已添加到收藏', 'Added to favorites', '已添加到收藏', 'お気に入りに追加', '즐겨찾기에 추가'),
  removeFav: _('已取消收藏', 'Removed from favorites', '已取消收藏', 'お気に入りから削除', '즐겨찾기에서 제거'),

  // 收藏/历史
  favTitle: _('我喜欢的', 'Favorites', '我喜歡的', 'お気に入り', '즐겨찾기'),
  historyTitle: _('最近播放', 'Recently Played', '最近播放', '最近再生', '최근 재생'),
  emptyFav: _('暂无收藏', 'No favorites yet', '暫無收藏', 'お気に入りなし', '즐겨찾기 없음'),
  emptyHistory: _('暂无播放历史', 'No history yet', '暫無播放歷史', '履歴なし', '기록 없음'),

  // 播放器页
  backBtn: _('返回', 'Back', '返回', '戻る', '뒤로'),
  emptyPlayer: _('请选择一首歌曲播放', 'Select a song to play', '請選擇一首歌曲播放', '曲を選択してください', '노래를 선택하세요'),

  // 播放控制
  prevTrack: _('上一首', 'Previous', '上一首', '前へ', '이전'),
  nextTrack: _('下一首', 'Next', '下一首', '次へ', '다음'),
  modeOrder: _('顺序播放', 'Order play', '順序播放', '順序再生', '순서 재생'),
  download: _('下载', 'Download', '下載', 'ダウンロード', '다운로드'),
  queue: _('播放队列', 'Queue', '播放隊列', '再生キュー', '재생 대기열'),

  // 下载
  downloadDone: _('下载完成: {path}', 'Downloaded: {path}', '下載完成: {path}', 'ダウンロード完了: {path}', '다운로드 완료: {path}'),
  downloadFailed: _('下载失败: {error}', 'Download failed: {error}', '下載失敗: {error}', 'ダウンロード失敗: {error}', '다운로드 실패: {error}'),

  // 时间
  justNow: _('刚刚', 'Just now', '剛剛', 'たった今', '방금'),
  minutesAgo: _('{n} 分钟前', '{n} min ago', '{n} 分鐘前', '{n}分前', '{n}분 전'),
  hoursAgo: _('{n} 小时前', '{n} hr ago', '{n} 小時前', '{n}時間前', '{n}시간 전'),
}
