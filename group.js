import { openai, supabase } from './config.js';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import moviesArr from "./content"

const omdbKey = import.meta.env.VITE_OMDB_API_KEY

const headerContainer = document.getElementById("header-container")
const inputs = document.querySelectorAll("textarea")
const moodInputs = document.querySelectorAll("input[name='mood-group']")
const oldNewInputs = document.querySelectorAll("input[name='old-new-group']")
const qnsForm = document.getElementById("individual-details")
const revealMovieContainer = document.getElementById("reveal-movie")
const firstMCQ = document.getElementById("first-choice-options")
const secondMCQ = document.getElementById("second-choice-options")
const groupQnsForm = document.getElementById("group-question-form")
const mainSubmitBtn = document.getElementById("main-submit-btn")
const currentParticipant = document.getElementById("participant-number-current")
const revealBtn = document.getElementById("reveal-btn")

let participants = 0
let duration = ""
let groupPreferences = []

const gptMessages = [
  {
    role: "system",
    content: `You are a professional movie critic. 
    
    INPUT STRUCTURE:
    You will receive text containing two parts separated by a single pipe "|". If you see more than one Context and Query pairs that just means there were multiple users involved in this questionnaire and you need to take into consideration each of their preferences and recommend a movie to fit all users. 
    - Part 1 (Context): A mixture of movie data/descriptions.
    - Part 2 (Queries): User personal preferences regarding movies.

    TASK:
    Recommend up to 3 movies from the provided Context that best match the Queries.
    
    CONSTRAINTS:
    - Format: Title (Date) || Short Description || SearchParameter
    - Separator: Use a single "*" between each movie recommendation.
    - No bolding or text decorations.
    - Length: Under 150 words total.
    - Accuracy: If the Context doesn't contain a relevant movie, say "Sorry, I don't know the answer." do not hallucinate.
    - Search Parameter: Movie title converted for a search query, separate the date with a "," separator (no "search=" prefix).
    `
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

const recommendMovie = async (content, query, duration) => {
  gptMessages.push({
    role: "user",
    content: `Context: ${content}, Query: ${query}, Duration: ${duration}`
  })
  console.log(duration)
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

const getMoviePoster = async (movieTitle) => {
  const titleParam = movieTitle.split(", ")
  const response = await fetch(`http://www.omdbapi.com/?t=${titleParam[0]}&y=${titleParam[1]}&apikey=${omdbKey}`)
  const data = await response.json()
  return data.Poster
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
      )).join(" | "), duration
    )

    console.log(response)

    const responseSplit = response.split("*")

    const revealedMovies = await Promise.all(responseSplit.map( async movie => {
      const movieSplit = movie.split(" || ")
      console.log(movieSplit)
      const moviePoster = await getMoviePoster(movieSplit[2])
      return {
        title: movieSplit[0],
        content: movieSplit[1],
        search_param: movieSplit[2],
        img: moviePoster,
      }
    }))

    const revealedMoviesHTML = document.createElement("div")
    
    revealedMoviesHTML.innerHTML = revealedMovies.map
    ((movie, index) => {
      const display = index === 0
        ? ""
        : "hide"
      return `
        <div id="reveal-movie-container-${index}" class="reveal-movie-container ${display}" data="reveal-movie-container-${index}">
          <h2 id="reveal-movie-title">${movie.title}</h2>
          <img src="${movie.img}">
          <p id="reveal-movie-desc">${movie.content}</p>
        </div>
      `
    }).join("")

    console.log(revealedMovies)

    if (revealedMovies.length > 1) {
      revealBtn.textContent = "Next Movie"
    } else {
      revealBtn.textContent = "Go Again"
    }

    headerContainer.classList.add("hide")

    revealBtn.dataset.currentContainer = 0

    revealMovieContainer.prepend(revealedMoviesHTML)
    revealMovieContainer.classList.remove("hide")

    groupQnsForm.classList.add("hide")
    qnsForm.classList.add("hide")

    currentParticipant.classList.add("hide")
  } else {
    inputs.forEach((input) => {
      input.value = ""
    })

    moodInputs.forEach(input => {
      input.checked = false
      input.parentElement.classList.remove("active")
    })

    oldNewInputs.forEach(input => {
      input.checked = false
      input.parentElement.classList.remove("active")
    })

    currentParticipant.textContent = String(Number(currentParticipant.textContent) + 1)
  }
})

revealBtn.addEventListener("click", (e) => {
  const revealMovieSingleContainer = document.querySelectorAll(".reveal-movie-container")
  if (Number(revealBtn.dataset.currentContainer) + 1 === revealMovieSingleContainer.length) {
    revealBtn.textContent = "Go Again"
  } else if (Number(revealBtn.dataset.currentContainer) === revealMovieSingleContainer.length) {
    revealMovieContainer.classList.add("hide")

    qnsForm.classList.remove("hide")

    inputs.forEach(input => {
      input.value = ""
    })
  } else {
    revealBtn.textContent = "Next Movie"
    document.getElementById(`reveal-movie-container-${Number(revealBtn.dataset.currentContainer)}`).classList.add("hide")

    document.getElementById(`reveal-movie-container-${Number(revealBtn.dataset.currentContainer) + 1}`).classList.remove("hide")

    revealBtn.dataset.currentContainer = String(Number(revealBtn.dataset.currentContainer) + 1)
  }
})

// moviesArr.forEach(movie => embedStoreData(movie))

// batman because it is very story rich and the characters are interesting it is also loaded with action
// timothee chalamet because he is like so non chalant and i can learn french

// the avengers endgame because it is just so story rich and so unexpected it is just so exciting throughout the whole movie

// leonardo dicaprio probably because his acting is just so good and i would just spend time listening to him talking about his acting