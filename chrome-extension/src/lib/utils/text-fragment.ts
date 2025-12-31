/**
 * Generates a URL with a Text Fragment Anchor.
 * This highlights the specific text on the target page.
 * Format: #:~:text=[prefix-,]textStart[,textEnd]
 */
export function generateTextFragmentUrl(baseUrl: string, chunkContent: string): string {
  if (!chunkContent) return baseUrl

  // Clean the content slightly to ensure matching
  const cleanContent = chunkContent.replace(/\s+/g, ' ').trim()
  
  // Strategy: Take the first 6 words to create a unique enough anchor
  // We avoid taking the whole chunk because if one character differs (e.g. smart quotes), the highlight fails.
  const words = cleanContent.split(' ')
  
  if (words.length < 5) return baseUrl

  // Create the fragment: #:~:text=first%20six%20words
  const snippet = words.slice(0, 6).join(' ')
  const fragment = `#:~:text=${encodeURIComponent(snippet)}`

  return `${baseUrl}${fragment}`
}