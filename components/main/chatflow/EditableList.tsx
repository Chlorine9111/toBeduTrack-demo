"use client"

import { Button, Input } from "@heroui/react"
import { Plus, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface EditableListProps {
  items: string[]
  onChange: (items: string[]) => void
  addLabel?: string
  inputPlaceholder?: string
  className?: string
}

export default function EditableList({
  items,
  onChange,
  addLabel = "+ 添加",
  inputPlaceholder = "请输入内容",
  className,
}: EditableListProps) {
  const updateAt = (index: number, value: string) => {
    const next = [...items]
    next[index] = value
    onChange(next)
  }

  const removeAt = (index: number) => {
    const next = items.filter((_, currentIndex) => currentIndex !== index)
    onChange(next)
  }

  const addOne = () => {
    onChange([...items, ""])
  }

  return (
    <div className={cn("space-y-2", className)}>
      {items.map((item, index) => (
        <div key={`editable-item-${index}`} className="flex items-center gap-2">
          <Input
            value={item}
            onChange={(event) => updateAt(index, event.target.value)}
            placeholder={inputPlaceholder}
            className="flex-1 text-sm"
          />
          <Button isIconOnly variant="ghost" onPress={() => removeAt(index)} className="h-8 w-8 min-w-0">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" onPress={addOne}>
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  )
}

