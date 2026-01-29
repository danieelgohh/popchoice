import { openai, supabase } from './config.js';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"

import moviesArr from "./content"

// Spltting the large chunks of texts to preserve the semantic meaning of the whole thing so that the AI is also able to read the whole paragraph or the whole context and not have separate contexts for each sentences
const splitDescription = async (description) => {
  try {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 150,
      chunkOverlap: 15,
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
    await Promise.all(
      input.map( async (textChunk) => {
        const embeddedResponse = await openai.embeddings.create({
          model: "text-embedding-ada-002",
          input: textChunk.pageContent
        })

        const data = {
          content: textChunk.pageContent,
          embedding: embeddedResponse.data[0].embedding
        }

        await supabase.from('movies').insert(data)
        console.log("Embedding and storing complete!")
      })
    )
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

  const embedding = embeddingResponse.data[0].embedding
}

moviesArr.forEach(movie => embedStoreData(movie))