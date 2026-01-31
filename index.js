import { openai, supabase } from './config.js';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import moviesArr from "./content"

const inputs = document.querySelectorAll("textarea")
const qnsForm = document.getElementById("question-form")
const revealMovieContainer = document.getElementById("reveal-movie")
const revealMovieTitle = document.getElementById("reveal-movie-title")
const revealMovieDesc = document.getElementById("reveal-movie-desc")
const restartBtn = document.getElementById("restart-btn")

const gptMessages = [
  {
    role: "system",
    content: `You are a movie critique and you know the best movies and recommends people about it. You are given some context about movies and a questions or statements about preferences. Formulate a shrot answer using the provided context do not include any text decorations such as bolded texts. You should include important details like date of the movie along with the title in brackets can you put in a "|" separator after the movie and dates before your description of the movie. If you are unsure and cannot find the answer in the context say "Sorry, I don't know the answer." do not make up the answer, the answer should also not be lengthy try to keep it not more than 150 words`
  }
]


// Spltting the large chunks of texts to preserve the semantic meaning of the whole thing so that the AI is also able to read the whole paragraph or the whole context and not have separate contexts for each sentences
const splitDescription = async (description) => {
  try {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 250,
      chunkOverlap: 25,
    })

    const output = await splitter.createDocuments([description])
    console.log(output)
    return output
  } catch (err) {
    console.error(err.message)
  }
  
}

const embedStoreData = async (movieObj) => {
  try {
    const input = await splitDescription(movieObj.content) // Returns array of Obj {pageContent, metadata, id}
    const data = await Promise.all(
      input.map( async (textChunk) => {
        const embeddedResponse = await openai.embeddings.create({
          model: "text-embedding-ada-002",
          input: textChunk.pageContent
        })

        return {
          content: textChunk.pageContent,
          embedding: embeddedResponse.data[0].embedding
        }
      })
    )
    await supabase.from('movies').insert(data)
    console.log("Embedding and storing complete!")
  } catch (err) {
    console.error(err.message)
  }
}

// Match the input or search parameters converting it to an embedding and comparing it to the vector database based on the similarity
const matchEmbeddedData = async (input) => {
  const embeddedResponse = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input,
  })

  const embedding = embeddedResponse.data[0].embedding

  const { data } = await supabase.rpc('match_movies', {
    query_embedding: embedding,
    match_threshold: 0.50,
    match_count: 5
  })

  return data
}

const recommendMovie = async (content, query) => {
  gptMessages.push({
    role: "user",
    content: `Context: ${content} Query: ${query}`
  })

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: gptMessages,
    temperature: 0.5,
    frequency_penalty: 0.5
  })
  
  return response.choices[0].message.content
}

inputs.forEach(input => {
  input.addEventListener("input", (e) => {
    input.value = e.target.value
  })
})

qnsForm.addEventListener("submit", async (e) => {
  e.preventDefault()

  const qnsFormData = new FormData(qnsForm)

  const firstQn = qnsFormData.get("favorite-movie")
  const secondQn = qnsFormData.get("old-new")
  const thirdQn = qnsFormData.get("seriousness")

  const data1 = await matchEmbeddedData(firstQn)
  const data2 = await matchEmbeddedData(secondQn)
  const data3 = await matchEmbeddedData(thirdQn)

  const data2Ids = new Set(data2.map(data => (data.id)))
  const data3Ids = new Set(data3.map(data => (data.id)))

  const finalizedMovies = data1.filter(data => (
    data2Ids.has(data.id)
  )).filter(data => (
    data3Ids.has(data.id)
  ))

  const response = await recommendMovie(finalizedMovies[0].content)
  const responseSplit = response.split("|")

  revealMovieTitle.textContent = responseSplit[0]
  revealMovieDesc.textContent = responseSplit[1]

  revealMovieContainer.classList.remove("hide")

  qnsForm.classList.add("hide")
})

restartBtn.addEventListener("click", () => {
  revealMovieContainer.classList.add("hide")

  qnsForm.classList.remove("hide")

  inputs.forEach(input => {
    input.value = ""
  })
})

// moviesArr.forEach(movie => embedStoreData(movie))

// batman because it is very story rich and the characters are interesting it is also loaded with action