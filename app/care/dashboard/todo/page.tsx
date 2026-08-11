import TodoList from '../components/TodoList'
import { NOTA_SCADENZA } from '@/lib/todoConfig'

export default function TodoPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-extrabold text-ink-navy mb-1">To-do List</h1>
      <p className="text-ink-navy/50 mb-6">
        Le stesse voci che vedi in Overview. {NOTA_SCADENZA.toLowerCase()}.
      </p>

      <div className="bg-white rounded-2xl border border-ink-navy/10 shadow-sm p-6">
        <TodoList />
      </div>
    </div>
  )
}
