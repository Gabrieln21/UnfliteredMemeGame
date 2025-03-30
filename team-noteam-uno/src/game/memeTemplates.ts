/**
 * Meme Templates Collection
 * Defines the available meme templates for the game
 */

export interface MemeTemplate {
    id: string;
    url: string;
    captionFields: number;
    name: string;
    description?: string;
    category?: string;
}

export const memeTemplates: MemeTemplate[] = [
    {
        id: 'drake',
        url: '/memes/drake.jpg',
        captionFields: 2,
        name: 'Drake Hotline Bling',
        description: 'Drake appears to be rejecting something in the top panel and approving something in the bottom panel',
        category: 'reaction'
    },
    {
        id: 'distracted-boyfriend',
        url: '/memes/drake.jpg',
        captionFields: 3,
        name: 'Distracted Boyfriend',
        description: 'A man looking back at another woman while his girlfriend looks at him disapprovingly',
        category: 'reaction'
    },
    {
        id: 'two-buttons',
        url: '/memes/drake.jpg',
        captionFields: 2,
        name: 'Two Buttons',
        description: 'A person sweating while deciding between two buttons',
        category: 'decision'
    },
    {
        id: 'expanding-brain',
        url: '/memes/drake.jpg',
        captionFields: 4,
        name: 'Expanding Brain',
        description: 'Four panels showing increasingly complex ideas with expanding brain images',
        category: 'progression'
    },
    {
        id: 'change-my-mind',
        url: '/memes/drake.jpg',
        captionFields: 1,
        name: 'Change My Mind',
        description: 'Person sitting at a table with a sign challenging others to change their mind',
        category: 'debate'
    },
    {
        id: 'this-is-fine',
        url: '/memes/drake.jpg',
        captionFields: 1,
        name: 'This Is Fine',
        description: 'Dog sitting in a burning room saying everything is fine',
        category: 'reaction'
    },
    {
        id: 'one-does-not-simply',
        url: '/memes/drake.jpg',
        captionFields: 1,
        name: 'One Does Not Simply',
        description: 'Boromir from Lord of the Rings saying one does not simply do something',
        category: 'classic'
    },
    {
        id: 'doge',
        url: '/memes/drake.jpg',
        captionFields: 5,
        name: 'Doge',
        description: 'Shiba Inu dog with multiple text captions in Comic Sans',
        category: 'classic'
    }
];