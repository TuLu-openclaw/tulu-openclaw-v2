import { _ } from '../helper.js'

export default {
  categoryMovies: _('电影', 'Movies', '電影'),
  categorySeries: _('电视剧', 'TV series', '電視劇'),
  categoryVariety: _('综艺', 'Variety', '綜藝'),
  categoryAnime: _('动漫', 'Anime', '動漫'),
  categoryShortDrama: _('短剧', 'Short drama', '短劇'),
  networkErrorWithStatus: _('网络错误：{status}', 'Network error: {status}', '網路錯誤：{status}'),
  noSearchResults: _('未找到相关影片', 'No matching videos found', '未找到相關影片'),
  playSource: _('播放', 'Playback', '播放'),
  unknownEpisode: _('未知', 'Unknown', '未知'),
  unknownError: _('未知错误', 'Unknown error', '未知錯誤'),
  hlsPlaybackFailed: _('HLS播放失败：{details}', 'HLS playback failed: {details}', 'HLS播放失敗：{details}'),
  hlsUnsupported: _('当前环境不支持HLS播放', 'The current environment does not support HLS playback', '目前環境不支援HLS播放'),
  emptyCurrentSource: _('当前源暂无数据，切换其他源试试', 'No data from this source. Try switching sources.', '目前來源暫無資料，請嘗試切換其他來源'),
  emptyContent: _('暂无内容', 'No content yet', '暫無內容'),
  previousPage: _('上一页', 'Previous', '上一頁'),
  nextPage: _('下一页', 'Next', '下一頁'),
  searchingProgress: _('正在搜索 {query} ... {percent}% ({done}/{total})', 'Searching {query} ... {percent}% ({done}/{total})', '正在搜尋 {query} ... {percent}% ({done}/{total})'),
  searching: _('搜索中...', 'Searching...', '搜尋中...'),
}
