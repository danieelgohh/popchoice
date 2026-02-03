import { openai, supabase } from './config.js';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import moviesArr from "./content"

const inputs = document.querySelectorAll("textarea")
const moodInputs = document.querySelectorAll("input[name='mood-group']")
const oldNewInputs = document.querySelectorAll("input[name='old-new-group']")
const qnsForm = document.getElementById("individual-details")
const revealMovieContainer = document.getElementById("reveal-movie")
const revealMovieTitle = document.getElementById("reveal-movie-title")
const revealMovieDesc = document.getElementById("reveal-movie-desc")
const restartBtn = document.getElementById("restart-btn")
const firstMCQ = document.getElementById("first-choice-options")
const secondMCQ = document.getElementById("second-choice-options")
const groupQnsForm = document.getElementById("group-question-form")
const mainSubmitBtn = document.getElementById("main-submit-btn")
const currentParticipant = document.getElementById("participant-number-current")

let participants = 0
let duration = ""
let groupPreferences = []

const gptMessages = [
  {
    role: "system",
    content: `You are a movie critique and you know the best movies and recommends people about it. You are given some list of context about movies and a questions or statements about preferences these context and queries will always be separated by "|" for the query think of it as queries from different people and the context is a mixture everyone involved in the survey. Recommend the most suitable movies based on the context and queries from these users you should recommend at max 3 movies and formulate a short answer using the provided context do not include any text decorations such as bolded texts. You should include important details like date of the movie along with the title in brackets can you put in a "|" separator after the movie and dates before your description of the movie. If you are unsure and cannot find the answer in the context say "Sorry, I don't know the answer." do not make up the answer, the answer should also not be lengthy try to keep it not more than 150 words. You should separate each movie with a "*"`
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
    match_count: 3
  })

  return data
}

const recommendMovie = async (content, query) => {
  gptMessages.push({
    role: "user",
    content: `Context: ${content} Query: ${query}`
  })

  console.log(content)
  console.log(query)

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: gptMessages,
    temperature: 0.5,
    frequency_penalty: 0.5
  })

  console.log(response)
  
  return response.choices[0].message.content
}

inputs.forEach(input => {
  input.addEventListener("input", (e) => {
    input.value = e.target.value
  })
})

firstMCQ.addEventListener("change", (e) => {
  [...firstMCQ.children].forEach((child) => {
    child.classList.remove("active")
  })
  e.target.parentElement.classList.add("active")
})

secondMCQ.addEventListener("change", (e) => {
  [...secondMCQ.children].forEach((child) => {
    child.classList.remove("active")
  })
  e.target.parentElement.classList.add("active")
})

groupQnsForm.addEventListener("submit", (e) => {
  e.preventDefault()

  const groupQnsFormData = new FormData(groupQnsForm)
  participants = Number(groupQnsFormData.get("participants"))
  duration = groupQnsFormData.get("time-have")

  groupQnsForm.classList.toggle("hide")
  qnsForm.classList.toggle("hide")
  currentParticipant.classList.toggle("hide")
  currentParticipant.textContent = "1"

  if (Number(currentParticipant.textContent) < participants) {
    mainSubmitBtn.textContent = "Next Person"
  }
})

qnsForm.addEventListener("submit", async (e) => {
  e.preventDefault()

  const qnsFormData = new FormData(qnsForm)
  const formDetails = {
    firstParam: qnsFormData.get("favorite-movie-group"),
    secondParam: qnsFormData.get("old-new-group"),
    thirdParam: qnsFormData.get("mood-group"),
    lastParam: qnsFormData.get("favorite-actor-group"),
  }

  groupPreferences.push(formDetails)

  if (Number(currentParticipant.textContent) === participants) {
    mainSubmitBtn.textContent = "Get Movie"
    const movies = groupPreferences.map( async (pref) => {
      const firstQuery = await matchEmbeddedData(pref.firstParam)
      const secondQuery = await matchEmbeddedData(pref.secondParam + pref.thirdParam)
      const lastQuery = await matchEmbeddedData(pref.lastParam)

      const finalizedMovies = new Set([
        ...firstQuery.map(data => data.content), 
        ...secondQuery.map(data => data.content), 
        ...lastQuery.map(data => data.content)])

      return finalizedMovies
    })

    const moviesToRecommend = (await Promise.all(movies)).flatMap(movie => Array.from(movie))

    const response = await recommendMovie(moviesToRecommend.join(" | "),
      groupPreferences.map(pref => (
        `My favorite movie is ${pref.firstParam} and I'm in the mood for something ${pref.secondParam} and ${pref.thirdParam}. Someone famous in film I would love to be stranded on an island with is ${pref.lastParam}`
      )).join(" | ")
    )

    // if (moviesToRecommend.length > 1) {
    //   moviesToRecommend.forEach(async (movie, index) => {
    //     response = await recommendMovie(movie, 
    //       `My favorite movie is ${groupPreferences[index].firstParam} and I'm in the mood for something ${groupPreferences[index].secondParam} and ${groupPreferences[index].thirdParam}. Someone famous in film I would love to be stranded on an island with is ${groupPreferences[index].lastParam}`
    //     )
    //   })
    // } else {
    //   response = await recommendMovie(moviesToRecommend[0],
    //     `My favorite movie is ${groupPreferences[0].firstParam} and I'm in the mood for something ${groupPreferences[0].secondParam} and ${groupPreferences[0].thirdParam}. Someone famous in film I would love to be stranded on an island with is ${groupPreferences[0].lastParam}`
    //   )
    // }

    console.log(response)

    // revealMovieTitle.textContent = responseSplit[0]
    // revealMovieDesc.textContent = responseSplit[1]

    // revealMovieContainer.classList.remove("hide")

    // qnsForm.classList.add("hide")
  } else {
    inputs.forEach((input) => {
      input.value = ""
    })

    moodInputs.forEach(input => {
      input.value = ""
      input.parentElement.classList.remove("active")
    })

    oldNewInputs.forEach(input => {
      input.value = ""
      input.parentElement.classList.remove("active")
    })

    currentParticipant.textContent = String(Number(currentParticipant.textContent) + 1)
  }

  // const data1 = await matchEmbeddedData(firstQn)
  // const data2 = await matchEmbeddedData(secondQn)
  // const data3 = await matchEmbeddedData(thirdQn)

  // const data2Ids = new Set(data2.map(data => (data.id)))
  // const data3Ids = new Set(data3.map(data => (data.id)))

  // const finalizedMovies = data1.filter(data => (
  //   data2Ids.has(data.id)
  // )).filter(data => (
  //   data3Ids.has(data.id)
  // ))

  // const response = await recommendMovie(finalizedMovies[0].content)
  // const responseSplit = response.split("|")

  // revealMovieTitle.textContent = responseSplit[0]
  // revealMovieDesc.textContent = responseSplit[1]

  // revealMovieContainer.classList.remove("hide")

  // qnsForm.classList.add("hide")
})

mainSubmitBtn.addEventListener("click", () => {
  return
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
// timothee chalamet because he is like so non chalant and i can learn french

// the avengers endgame because it is just so story rich and so unexpected it is just so exciting throughout the whole movie

// leonardo dicaprio probably because his acting is just so good and i would just spend time listening to him talking about his acting